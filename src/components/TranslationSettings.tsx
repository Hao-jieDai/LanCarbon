import { useEffect, useState } from "react";
import { aiModelName, type AIModel, type AIProvider } from "../shared/ai";
import { defaultTranslationSettings, DEFAULT_TRANSLATION_PROMPT, type TranslationCacheStats, type TranslationSettings as Preferences } from "../shared/translation";
import { ThemedSelect } from "./ThemedSelect";

export function TranslationSettings({ providers: shared }: { providers: AIProvider[] }) {
  const [settings, setSettings] = useState<Preferences>(defaultTranslationSettings);
  const [custom, setCustom] = useState<AIProvider[]>([]);
  const [draft, setDraft] = useState<AIProvider>();
  const [key, setKey] = useState("");
  const [available, setAvailable] = useState<AIModel[]>([]);
  const [cache, setCache] = useState<TranslationCacheStats>({ entries: 0, bytes: 0 });
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const candidates = settings.mode === "reuse" ? shared : custom;
  const provider = candidates.find(provider => provider.id === settings.providerId);
  useEffect(() => {
    let alive = true;
    void window.notesDesktop.translation!.settings().then(result => { if (!alive) return; if (!result.ok) throw Error(result.error); setSettings(result.settings); setCustom(result.providers); setDraft(result.providers.find(provider => provider.id === result.settings.providerId)); setCache(result.cache); setLoaded(true); }).catch(error => { if (alive) setError(String(error)); });
    return () => { alive = false; };
  }, []);
  const choose = (mode: Preferences["mode"], id: string) => {
    const selected = (mode === "reuse" ? shared : custom).find(provider => provider.id === id);
    setSettings({ ...settings, mode, providerId: id, modelId: selected?.defaultModel ?? "", modelName: selected?.models.find(model => model.id === selected.defaultModel)?.name ?? "" });
    setDraft(mode === "custom" ? selected : undefined); setKey(""); setAvailable([]); setError(""); setNotice("");
  };
  const act = async (action: () => Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const saveConnection = async () => {
    if (settings.mode !== "custom") return;
    if (!draft) throw Error("Choose a translation service first.");
    const models = settings.modelId.trim() ? [{ id: settings.modelId.trim(), name: settings.modelName.trim() || aiModelName(settings.modelId), purpose: "chat" as const }] : draft.models;
    const result = await window.notesDesktop.translation!.saveProvider({ ...draft, models, defaultModel: models[0]?.id ?? "", apiKey: key || undefined });
    if (!result.ok) throw Error(result.error);
    setCustom(result.providers); setDraft(result.providers.find(provider => provider.id === draft.id)); setKey("");
  };
  const save = async () => {
    if (!provider || !settings.modelId.trim()) throw Error("Choose a service and model first.");
    await saveConnection();
    const result = await window.notesDesktop.translation!.saveSettings({ ...settings, modelId: settings.modelId.trim(), modelName: settings.modelName.trim() || aiModelName(settings.modelId) });
    if (!result.ok) throw Error(result.error); setSettings(result.settings);
  };
  return <div className="ai-settings-content translation-settings">
    <div className="ai-heading"><h1>Translation Settings</h1><p>Translate selected English into Chinese across LanCarbon. Translation starts off each time you open the app.</p></div>
    <p className="modal-help">Use the sidebar Translate switch or Ctrl+Alt+T. Only a selected word, phrase or short passage is sent to your chosen service.</p>
    <form onSubmit={event => { event.preventDefault(); void act(async () => { await save(); setNotice("Translation settings saved."); }); }}>
      <div className="translation-config-grid">
        <label>Connection<ThemedSelect label="Translation connection" value={settings.mode} options={[{ value: "reuse", label: "Use an existing AI connection" }, { value: "custom", label: "Separate translation connection" }]} disabled={busy || !loaded} onChange={value => { const mode = value as Preferences["mode"]; choose(mode, (mode === "reuse" ? shared.find(provider => provider.hasKey) : custom[0])?.id ?? ""); }}/></label>
        <label>Service<ThemedSelect label="Translation service" value={settings.providerId} options={candidates.map(provider => ({ value: provider.id, label: provider.name + (provider.hasKey ? "" : " · Key needed") }))} placeholder="Choose a service" disabled={busy || !loaded} onChange={id => choose(settings.mode, id)}/></label>
      </div>
      {settings.mode === "custom" && draft && <div className="translation-connection-fields">
        <label>Configuration name<input aria-label="Translation configuration name" disabled={busy || draft.kind !== "others"} maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
        <label>API base address<input data-translation-exclude aria-label="Translation API base address" disabled={busy || draft.kind !== "others"} value={draft.baseUrl} placeholder="https://example.com/v1" onChange={event => setDraft({ ...draft, baseUrl: event.target.value })}/></label>
        <label>API Key<input data-translation-exclude aria-label="Translation API Key" type="password" autoComplete="off" value={key} placeholder={draft.hasKey ? "Saved securely · leave blank to keep" : "Paste the service API key"} disabled={busy} onChange={event => setKey(event.target.value)}/></label>
        {draft.hasKey && <div className="ai-saved-key" data-translation-exclude><span>Configured <output aria-label="Saved translation API key">{draft.maskedKey || "Saved securely"}</output></span><button className="quiet-button" type="button" disabled={busy} onClick={() => void act(async () => { const result = await window.notesDesktop.translation!.clearKey(draft.id); if (!result.ok) throw Error(result.error); setCustom(result.providers); setDraft(result.providers.find(provider => provider.id === draft.id)); setKey(""); setNotice("Translation API key removed."); })}>Remove translation key</button></div>}
      </div>}
      {settings.mode === "reuse" && provider && <p className="modal-help">{provider.name} · {provider.hasKey ? "Saved key is reused securely." : "Configure its key in AI Settings first."} Translation can use a model that is not in your Chat list.</p>}
      <div className="translation-model-row">
        <label>Model ID<ThemedSelect editable label="Translation model ID" value={settings.modelId} options={[...new Map([...(provider?.models ?? []), ...available].map(model => [model.id, model])).values()].map(model => ({ value: model.id, label: model.id }))} placeholder="Select or enter a model ID" emptyMessage="Refresh models or enter an ID." disabled={busy || !loaded} onChange={id => setSettings({ ...settings, modelId: id, modelName: available.find(model => model.id === id)?.name ?? aiModelName(id) })}/></label>
        <label>Display name<input aria-label="Translation model display name" maxLength={100} disabled={busy || !loaded} value={settings.modelName} onChange={event => setSettings({ ...settings, modelName: event.target.value })}/></label>
        <button className="quiet-button" type="button" disabled={busy || !loaded || !provider} onClick={() => void act(async () => { await saveConnection(); const result = await window.notesDesktop.translation!.models(settings.mode, settings.providerId); if (!result.ok) throw Error(result.error); setAvailable(result.models); setNotice(result.models.length + " models found. Choose one and save translation settings."); })}>Refresh translation models</button>
      </div>
      <p className="modal-help">For SiliconFlow, try tencent/Hunyuan-MT-7B. Check availability and current prices in your service's catalogue. General chat models can also translate with the prompt below.</p>
      <details className="ai-guidelines"><summary>Translation prompt</summary><label>Prompt style<ThemedSelect label="Translation prompt style" value={settings.template} options={[{ value: "auto", label: "Automatic" }, { value: "standard", label: "General chat model" }, { value: "hunyuan", label: "Hunyuan translation model" }]} disabled={busy} onChange={template => setSettings({ ...settings, template: template as Preferences["template"] })}/></label>
        <label>Translation prompt<textarea data-translation-exclude aria-label="Translation prompt" rows={5} maxLength={8000} value={settings.prompt} disabled={busy} onChange={event => setSettings({ ...settings, prompt: event.target.value })}/></label>
        <p className="modal-help">Automatic uses Hunyuan's translation template for Hunyuan-MT / HY-MT and a separate system prompt for general models.</p>
        <button className="quiet-button" type="button" disabled={busy} onClick={() => setSettings({ ...settings, prompt: DEFAULT_TRANSLATION_PROMPT, template: "auto" })}>Restore translation prompt</button>
      </details>
      <div className="ai-actions"><button className="primary-button" type="submit" disabled={busy || !loaded}>Save translation settings</button><button className="quiet-button" type="button" disabled={busy || !loaded} onClick={() => void act(async () => { await save(); const result = await window.notesDesktop.translation!.test(); if (!result.ok) throw Error(result.error); setNotice("Translation test: " + result.result.text); const current = await window.notesDesktop.translation!.settings(); if (current.ok) setCache(current.cache); })}>Test translation</button><button className="quiet-button" type="button" disabled={!busy} onClick={() => { void window.notesDesktop.translation!.cancel(); }}>Stop translation test</button></div>
    </form>
    <p className="modal-help">Test translation makes a short model request and may use service credits.</p>
    <section className="translation-cache"><h2>Saved translations</h2><p className="modal-help">{cache.entries.toLocaleString()} saved results · {(cache.bytes / 1_000_000).toFixed(2)} MB. Up to 1,000 results / 5 MB.</p><button className="quiet-button" disabled={busy || !loaded} onClick={() => void act(async () => { const result = await window.notesDesktop.translation!.clearCache(); if (!result.ok) throw Error(result.error); setCache(result.cache); setNotice("Saved translations cleared."); })}>Clear translation cache</button></section>
    {busy && <p role="status">Working…</p>}{notice && <p className="ai-notice" role="status">{notice}</p>}{error && <p className="ai-error" role="alert">{error}</p>}
  </div>;
}
