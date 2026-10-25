import { useEffect, useState } from "react";
import { aiModelName, type AIModel, type AIProvider } from "../shared/ai";
import { defaultTranslationSettings, DEFAULT_TRANSLATION_PROMPT, TRANSLATION_TEST_TEXT, type TranslationCacheStats, type TranslationResult, type TranslationSettings as Preferences } from "../shared/translation";
import { ThemedSelect } from "./ThemedSelect";

export function TranslationSettings({ providers: shared }: { providers: AIProvider[] }) {
  const [settings, setSettings] = useState<Preferences>(defaultTranslationSettings);
  const [custom, setCustom] = useState<AIProvider[]>([]), [draft, setDraft] = useState<AIProvider>();
  const [key, setKey] = useState(""), [available, setAvailable] = useState<AIModel[]>([]);
  const [cache, setCache] = useState<TranslationCacheStats>({ entries: 0, bytes: 0 });
  const [busy, setBusy] = useState(false), [testing, setTesting] = useState(false), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [testResult, setTestResult] = useState<TranslationResult>();
  const candidates = settings.mode === "reuse" ? shared : custom;
  const provider = candidates.find(provider => provider.id === settings.providerId);
  const configuredModel = provider?.models.find(model => model.id === settings.modelId);
  const validModel = settings.mode === "custom" ? !!settings.modelId.trim() : !!configuredModel;
  useEffect(() => {
    let alive = true;
    void window.notesDesktop.translation!.settings().then(result => {
      if (!alive) return; if (!result.ok) throw Error(result.error);
      setSettings({ ...result.settings, template: "auto" }); setCustom(result.providers);
      setDraft(result.providers.find(provider => provider.id === result.settings.providerId)); setCache(result.cache); setLoaded(true);
    }).catch(error => { if (alive) setError(String(error)); });
    return () => { alive = false; };
  }, []);
  const change = (update: Partial<Preferences>) => { setSettings(previous => ({ ...previous, ...update })); setTestResult(undefined); setNotice(""); };
  const choose = (mode: Preferences["mode"], id: string) => {
    const selected = (mode === "reuse" ? shared : custom).find(provider => provider.id === id);
    change({ mode, providerId: id, modelId: selected?.defaultModel ?? "", modelName: selected?.models.find(model => model.id === selected.defaultModel)?.name ?? "" });
    setDraft(mode === "custom" ? selected : undefined); setKey(""); setAvailable([]); setError("");
  };
  const act = async (action: () => Promise<void>) => { setBusy(true); setError(""); setNotice(""); setTestResult(undefined); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const saveConnection = async () => {
    if (settings.mode !== "custom") return;
    if (!draft) throw Error("Choose a translation service first.");
    const models = settings.modelId.trim() ? [{ id: settings.modelId.trim(), name: settings.modelName.trim() || aiModelName(settings.modelId), purpose: "chat" as const }] : draft.models;
    const result = await window.notesDesktop.translation!.saveProvider({ ...draft, models, defaultModel: models[0]?.id ?? "", apiKey: key || undefined });
    if (!result.ok) throw Error(result.error);
    setCustom(result.providers); setDraft(result.providers.find(provider => provider.id === draft.id)); setKey("");
  };
  const save = async () => {
    if (!provider || !validModel) throw Error("Choose a service and model first.");
    await saveConnection();
    const result = await window.notesDesktop.translation!.saveSettings({ ...settings, template: "auto", modelId: settings.modelId.trim(), modelName: settings.mode === "reuse" ? configuredModel!.name : settings.modelName.trim() || aiModelName(settings.modelId) });
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
      {settings.mode === "reuse" ? <>
        <p className="modal-help">Choose a model already saved in AI Settings. Its saved key and display name are reused.</p>
        <label className="translation-reuse-model">Model<ThemedSelect label="Translation model" value={settings.modelId} options={(provider?.models ?? []).map(model => ({ value: model.id, label: model.name }))} placeholder="Choose a configured model" disabled={busy || !loaded || !provider} emptyMessage="Save a model in AI Settings first." onChange={id => change({ modelId: id, modelName: provider?.models.find(model => model.id === id)?.name ?? "" })}/></label>
        {configuredModel && <p className="translation-model-id">{configuredModel.id}</p>}
        {provider && !provider.models.length && <p className="modal-help">This connection has no saved models. Configure one in AI Settings, or use a separate translation connection.</p>}
        {provider && settings.modelId && !configuredModel && <p className="modal-help">The previously selected model is not in this connection's saved list. Choose a configured model or use a separate translation connection.</p>}
      </> : <>
        <div className="translation-model-row">
          <label>Model ID<ThemedSelect editable label="Translation model ID" value={settings.modelId} options={[...new Map([...(provider?.models ?? []), ...available].map(model => [model.id, model])).values()].map(model => ({ value: model.id, label: model.id }))} placeholder="Select or enter a model ID" emptyMessage="Refresh models or enter an ID." disabled={busy || !loaded} onChange={id => change({ modelId: id, modelName: available.find(model => model.id === id)?.name ?? aiModelName(id) })}/></label>
          <label>Display name<input aria-label="Translation model display name" maxLength={100} disabled={busy || !loaded} value={settings.modelName} onChange={event => change({ modelName: event.target.value })}/></label>
          <button className="quiet-button" type="button" disabled={busy || !loaded || !provider} onClick={() => void act(async () => { await saveConnection(); const result = await window.notesDesktop.translation!.models(settings.mode, settings.providerId); if (!result.ok) throw Error(result.error); setAvailable(result.models); setNotice(result.models.length + " catalogue models found. Choose a model, save and test it."); })}>Refresh translation models</button>
        </div>
        <p className="modal-help">Refresh reads the service's model catalogue. Account access and pricing can vary; test your selected model before using it.</p>
      </>}
      <details className="ai-guidelines"><summary>Translation prompt</summary>
        <label>Translation instructions<textarea aria-label="Translation prompt" rows={5} maxLength={8000} value={settings.prompt} disabled={busy} onChange={event => change({ prompt: event.target.value })}/></label>
        <p className="modal-help">These instructions apply only to translation. The default requests accurate academic Chinese without explanations or emoji. You can select English here for translation too.</p>
        <button className="quiet-button" type="button" disabled={busy} onClick={() => change({ prompt: DEFAULT_TRANSLATION_PROMPT, template: "auto" })}>Restore translation prompt</button>
      </details>
      <div className="ai-actions"><button className="primary-button" type="submit" disabled={busy || !loaded || !validModel}>Save translation settings</button><button className="quiet-button" type="button" disabled={busy || !loaded || !validModel} onClick={() => void act(async () => {
        await save(); setTesting(true);
        try { const result = await window.notesDesktop.translation!.test(); if (!result.ok) throw Error(result.error); setTestResult(result.result); const current = await window.notesDesktop.translation!.settings(); if (current.ok) setCache(current.cache); }
        finally { setTesting(false); }
      })}>Test translation</button><button className="quiet-button" type="button" disabled={!testing} onClick={() => { void window.notesDesktop.translation!.cancel(); }}>Stop translation test</button></div>
    </form>
    {testResult && <section className="translation-test-result" aria-label="Translation test result"><strong role="status">Translation test succeeded</strong><p className="translation-test-model">{testResult.providerName} · {testResult.modelName}</p><dl><dt>English</dt><dd>{TRANSLATION_TEST_TEXT}</dd><dt>Chinese</dt><dd>{testResult.text}</dd></dl>{testResult.timing && <details><summary>Response time</summary><dl><dt>Local preparation</dt><dd>{(testResult.timing.dispatchMs / 1000).toFixed(2)} s</dd><dt>Waiting for first text</dt><dd>{testResult.timing.firstTextMs === undefined ? "Not received" : (Math.max(0, testResult.timing.firstTextMs - testResult.timing.dispatchMs) / 1000).toFixed(2) + " s"}</dd><dt>Total request time</dt><dd>{(testResult.timing.totalMs / 1000).toFixed(2)} s</dd></dl></details>}</section>}
    {busy && <p role="status">Working…</p>}{notice && <p className="ai-notice" role="status">{notice}</p>}{error && <p className="ai-error" role="alert">{error}</p>}
    <p className="modal-help">Test translation sends the short English sentence shown in its result and may use service credits.</p>
    <section className="translation-cache"><h2>Saved translations</h2><p className="modal-help">{cache.entries.toLocaleString()} saved results · {(cache.bytes / 1_000_000).toFixed(2)} MB. Up to 1,000 results / 5 MB.</p><button className="quiet-button" disabled={busy || !loaded} onClick={() => void act(async () => { const result = await window.notesDesktop.translation!.clearCache(); if (!result.ok) throw Error(result.error); setCache(result.cache); setNotice("Saved translations cleared."); })}>Clear translation cache</button></section>
  </div>;
}
