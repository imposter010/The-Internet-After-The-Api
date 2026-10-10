import { Badge, Empty, JsonView, Panel, humanTime } from './components.jsx';

export function AiAnalysis({ analysis }) {
  if (!analysis) return <Empty title="No LLM analysis recorded" detail="New incidents receive analysis when a model is configured. Existing historical incidents are not sent automatically." />;
  return <section className="ai-analysis" aria-label="LLM drift analysis">
    <div className="detail-meta"><Badge tone={analysis.status === 'completed' ? 'teal' : 'muted'}>{analysis.status}</Badge><code>{analysis.provider} / {analysis.model}</code><span>{analysis.latencyMs} ms</span><span>{humanTime(analysis.analyzedAt)}</span></div>
    {analysis.status === 'completed' ? <>
      <div className="detail-meta"><Badge tone={analysis.classification === 'minor' ? 'teal' : 'red'}>{analysis.classification || 'unclassified'}</Badge><span>Recommendation: {analysis.recommendedAction?.replaceAll('_', ' ')}</span><span>Model-reported risk: {analysis.risk}</span></div>
      {!!analysis.detectedChanges?.length && <><h3>What changed</h3><ul>{analysis.detectedChanges.map((change, index) => <li key={index}>{change}</li>)}</ul></>}
      {!!analysis.likelyEffects?.length && <><h3>Possible effects</h3><ul>{analysis.likelyEffects.map((effect, index) => <li key={index}>{effect}</li>)}</ul></>}
      <h3>Model explanation</h3><p>{analysis.explanation}</p>
      <h3>Easy Hinglish</h3><p>{analysis.hinglishExplanation}</p>
      {analysis.adapter && <JsonView value={analysis.adapter} label="LLM-corroborated candidate — not deployment authorization" />}
      {!!analysis.verificationNotes?.length && <><h3>Suggested operator checks — not executed tests</h3><ul>{analysis.verificationNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></>}
      <p className="form-hint">LLM output is untrusted guidance. Only gateway validation results and the passport decision establish activation.</p>
    </> : <><p>Reason: {analysis.reason?.replaceAll('_', ' ') || 'No usable model response'}.</p><p>Deterministic rules and validation remain in control. Unsupported changes stay blocked; no AI explanation is fabricated.</p></>}
  </section>;
}

export function LlmSettings({ data }) {
  const llm = data?.llm;
  const completed = (data?.incidents || []).filter(incident => incident.aiAnalysis?.status === 'completed').length;
  return <Panel title="LLM drift analyst" eyebrow="AI ASSISTANCE · SAFETY GATED"><div className="ai-analysis ai-settings">
    {!llm ? <Empty title="LLM status not reported" detail="Connect to the gateway, or restart an older running gateway after updating its code." /> : <>
      <div className="detail-meta"><Badge tone={llm.configured ? 'teal' : 'muted'}>{llm.configured ? 'Configured' : 'Not configured'}</Badge><code>{llm.provider} / {llm.model}</code></div>
      <p>Status: {llm.status === 'ready' ? 'Ready — no model response tested yet' : llm.status.replaceAll('_', ' ')}. {completed} model-analyzed incidents in this snapshot.</p>
      {llm.lastReason && <p>Last result: {llm.lastReason.replaceAll('_', ' ')}.</p>}
      <p>The model labels changes minor or major, lists their effects, corroborates an evidenced adapter or recommends review. It cannot invent fields, convert prices, execute code, or skip validation.</p>
      <JsonView label="Only required setting · apps/gateway/.env" value={'GROQ_API_KEY=your-private-key'} />
      <p className="form-hint">Paste the Groq key on the gateway server and restart it. Never enter this key as an administration token or a VITE_* variable. Inspect an incident's LLM analysis tab to confirm a real response; configured does not mean connected. See docs/LLM-GUIDE.md.</p>
    </>}
  </div></Panel>;
}
