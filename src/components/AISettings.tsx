import { useState } from "react";
import { AI_PRESETS, aiModelName, type AIProvider, type AIModel, type AIProviderKind } from "../shared/ai";
import { ThemedSelect } from "./ThemedSelect";

export function AISettings({ providers, onProviders }: { providers: AIProvider[]; onProviders(value: AIProvider[]): void }) {
  const [kind, setKind] = useState<AIProviderKind>("siliconflow");
  const [selected, setSelected] = useState("siliconflow");
  const [draft, setDraft] = useState<AIProvider>(() => providers.find(item => item.id === selected)!);
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [modelId, setModelId] = useState("");
  const [modelName, setModelName] = useState("");
  const [available, setAvailable] = useState<AIModel[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const select = (id: string, type = kind) => { const provider = providers.find(item => item.id === id); if (!provider) return; setKind(type); setSelected(id); setDraft(provider); setKey(""); setClearKey(false); setAvailable([]); setModelId(""); setModelName(""); setNotice(""); setError(""); };
  const act = async (label: string, action: () => Promise<void>) => { setBusy(label); setError(""); setNotice(""); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(""); } };
  const save = async (): Promise<AIProvider> => {
    const result = await window.notesDesktop.ai!.saveProvider({ ...draft, apiKey: key || undefined, clearKey });
    if (!result.ok) throw new Error(result.error);
    onProviders(result.providers); const saved = result.providers.find(item => item.id === draft.id)!; setDraft(saved); setKey(""); setClearKey(false); return saved;
  };
  const add = (id: string, name: string) => {
    id = id.trim(); name = name.trim() || aiModelName(id);
    if (!id || /\s/.test(id)) { setError("Enter the exact model ID without spaces"); return; }
    if (draft.models.some(model => model.id === id)) { setError("This model is already in your list"); return; }
    setDraft({ ...draft, models: [...draft.models, { id, name, purpose: "chat" }], defaultModel: draft.defaultModel || id }); setModelId(""); setModelName(""); setError(""); setNotice("Model added. Save configuration to use it in Chat.");
  };
  const preset = AI_PRESETS[kind];
  return <div className="ai-settings-content">
    <div className="ai-heading"><p className="foundation-eyebrow">RESEARCH</p><h1>AI Settings</h1><p>Connect your services and choose the models you use in Chat.</p></div>
    <div className="ai-provider-tabs" aria-label="AI service">{(["siliconflow", "openrouter", "others"] as const).map(type => <button disabled={!!busy} key={type} aria-pressed={kind === type} onClick={() => select(providers.find(item => item.kind === type)!.id, type)}>{AI_PRESETS[type].name}</button>)}</div>
    {kind === "others" && <div className="ai-other-configs"><ThemedSelect label="Other configuration" value={selected} options={providers.filter(item => item.kind === "others").map(item => ({ value: item.id, label: item.name }))} onChange={id => select(id)} disabled={!!busy}/><button disabled={!!busy} className="quiet-button" onClick={() => { const id = `others-${crypto.randomUUID()}`; setSelected(id); setDraft({ id, kind: "others", name: "My AI service", baseUrl: "", models: [], defaultModel: "", hasKey: false }); setKey(""); setClearKey(false); setAvailable([]); }}>Add configuration</button></div>}
    <form className="ai-connection-form" onSubmit={event => { event.preventDefault(); void act("Saving", async () => { await save(); setNotice("Configuration saved."); }); }}>
      <label>Configuration name<input aria-label="Configuration name" value={draft.name} disabled={!!busy || kind !== "others"} maxLength={100} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
      <label>API base address<input aria-label="API base address" value={draft.baseUrl} disabled={!!busy || kind !== "others"} placeholder="https://example.com/v1" onChange={event => setDraft({ ...draft, baseUrl: event.target.value })}/></label>
      <label>API Key<input aria-label="API Key" type="password" autoComplete="off" spellCheck={false} value={key} disabled={!!busy} placeholder={draft.hasKey ? "Saved securely · leave blank to keep" : "Paste your service API key"} onChange={event => { setKey(event.target.value); setClearKey(false); }}/></label>
      {draft.hasKey && <label className="ai-checkbox"><input type="checkbox" checked={clearKey} disabled={!!busy} onChange={event => setClearKey(event.target.checked)}/>Remove the saved key when saving</label>}
      {kind === "others" && <p className="modal-help">Use an OpenAI-compatible Chat Completions service. Enter its base address without /chat/completions.</p>}
      <div className="ai-actions"><button className="quiet-button" type="button" disabled={!!busy} onClick={() => void act("Refreshing models", async () => { const saved = await save(); const result = await window.notesDesktop.ai!.models(saved.id); if (!result.ok) throw new Error(result.error); setAvailable(result.models); setNotice(`${result.models.length} models found. Choose one below or enter its ID manually.`); })}>Refresh models</button><button className="primary-button" type="submit" disabled={!!busy}>Save configuration</button></div>
    </form>
    <section className="ai-models" aria-label="Configured models"><h2>Chat models</h2>
      {preset.modelId && !draft.models.some(model => model.id === preset.modelId) && <button className="quiet-button ai-suggested" disabled={!!busy} onClick={() => add(preset.modelId, preset.modelName)}>Add {preset.modelName}</button>}
      <div className="ai-model-entry"><label>Model ID<ThemedSelect editable label="Model ID" value={modelId} placeholder="Select or enter the exact model ID" emptyMessage="Enter a model ID, or refresh the model list." options={available.map(model => ({ value: model.id, label: model.id }))} disabled={!!busy} onChange={id => { setModelId(id); setModelName(available.find(model => model.id === id)?.name ?? aiModelName(id)); }}/></label><label>Display name<input aria-label="Model display name" value={modelName} disabled={!!busy} placeholder="A short name" onChange={event => setModelName(event.target.value)}/></label><button className="quiet-button" disabled={!!busy || !modelId.trim()} onClick={() => add(modelId, modelName)}>Add model</button></div>
      {!draft.models.length ? <p className="modal-help">Add at least one model to use this service in Chat.</p> : <><div className="ai-configured-models">{draft.models.map(model => <div key={model.id}><span><strong>{model.name}</strong><small>{model.id}</small></span><button className="quiet-button" disabled={!!busy} aria-label={`Remove ${model.name}`} onClick={() => { const models = draft.models.filter(item => item.id !== model.id); setDraft({ ...draft, models, defaultModel: draft.defaultModel === model.id ? models[0]?.id ?? "" : draft.defaultModel }); }}>Remove</button></div>)}</div><label className="ai-default-model">Default model<ThemedSelect label="Default model" value={draft.defaultModel} options={draft.models.map(model => ({ value: model.id, label: model.name }))} disabled={!!busy} onChange={defaultModel => setDraft({ ...draft, defaultModel })}/></label><div className="ai-actions"><button className="quiet-button" disabled={!!busy} onClick={() => void act("Testing model", async () => { const saved = await save(); const result = await window.notesDesktop.ai!.test(saved.id, saved.defaultModel); if (!result.ok) throw new Error(result.error); setNotice(result.message); })}>Test model</button><button className="primary-button" disabled={!!busy} onClick={() => void act("Saving", async () => { await save(); setNotice("Configuration saved."); })}>Save models</button></div></>}
    </section>
    {busy && <p role="status">{busy}…</p>}{notice && <p role="status" className="ai-notice">{notice}</p>}{error && <p role="alert" className="ai-error">{error}</p>}
    <p className="modal-help ai-settings-footnote">Keys are encrypted for your Windows account. A model test makes a small API request and may use service credits. Connections follow your computer's network settings.</p>
    {kind === "others" && selected !== "others" && providers.some(item => item.id === selected) && <button disabled={!!busy} className="quiet-button" onClick={() => void act("Removing configuration", async () => { const result = await window.notesDesktop.ai!.removeProvider(selected); if (!result.ok) throw new Error(result.error); onProviders(result.providers); const fallback = result.providers.find(item => item.id === "others")!; setSelected(fallback.id); setDraft(fallback); setKey(""); setClearKey(false); })}>Delete this configuration</button>}
  </div>;
}
