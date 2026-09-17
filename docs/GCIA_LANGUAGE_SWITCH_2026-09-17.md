# Response-language continuation correction

Post-publication verification of PR #77 source `9063de1d72cdd276205e99b48e8f2a1c548b0a97` found another explicit-language boundary. On the public Production deployment `6aac1308b73ff70007ac9066`, a French conversation received this request:

> Responde ahora en español. ¿Cuál es el precio base del Silk Press en mi salón?

The answer was Spanish and preserved the retrieved USD 120 price. However, the recorded request locale and returned preference remained French. The next question, “And how long does that service take?”, was answered in French. This is a failed language-persistence check, despite completed real OpenAI calls; it supersedes any blanket claim that all public follow-ups passed.

## Cause and correction

The deterministic leading-command parser recognized `responde en` but not `responde ahora en`. A null/stale planner language switch therefore left the previous preference active. The answer generator could independently follow the Spanish wording for one turn, masking the metadata mismatch until the next request.

The parser now accepts bounded temporal modifiers in clear leading English, French and Spanish language commands. It still does not infer preferences from the question's language, quoted commands, negation or service names. The resolved locale continues through the existing authorized tool, answer/fallback, returned response and client preference. No provider, model, budget, translation dependency, database, billing or publication configuration changed.

## Verification

- Reproduced before the correction with the exact Spanish input and a null provider switch: expected `es`, actual `fr`.
- Focused planner and route tests: 40 passed. Expanded switch cases cover null/stale provider switches, a different starting locale and the following ordinary English question. Existing quoted-command and language-mention negatives remain; Spanish negation and quoted temporal commands were added.
- TypeScript and targeted lint passed.
- Required CI, fresh held-candidate provider checks and publication of this correction are pending. The prior deployment remains the currently published release until this correction passes its release gates.

Wolof remains explicitly deferred. Actual customer login is skipped at the founder's request; this is not a passed authentication check. This correction does not certify the broader GCIA vision or native-speaker quality.
