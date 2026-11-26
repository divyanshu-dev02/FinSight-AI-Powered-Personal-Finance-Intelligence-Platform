import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiResponse } from '@/lib/api';

type Source = { id: string; label: string; path: string };
type ChatStatus = { available: boolean; provider: string };
type Reply = { answer: string; sources: Source[] };
type Turn = Reply & { question: string };

const suggestions = [
  'What were my biggest expense categories this month?',
  'Which bills and income are coming up?',
  'How much have I saved toward my goals?',
];

export function CopilotChat({ month, comparable }: { month: string; comparable: boolean }) {
  const availability = useQuery({
    queryKey: ['copilot-status'],
    queryFn: async ({ signal }) => (await api.get<ApiResponse<ChatStatus>>('/copilot/status', { signal })).data.data,
  });
  const [input, setInput] = useState('');
  const [consentedProvider, setConsentedProvider] = useState<string>();
  const provider = availability.data?.provider;
  const consent = !!provider && consentedProvider === provider;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController>(null);

  useEffect(() => () => { controller.current?.abort(); }, []);

  function clear() {
    controller.current?.abort();
    controller.current = null;
    setTurns([]);
    setInput('');
    setPending(undefined);
    setError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || !consent || controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setPending(question);
    setError(undefined);
    try {
      const history = turns.slice(-6).flatMap(turn => [
        { role: 'user', content: turn.question },
        { role: 'assistant', content: turn.answer },
      ]);
      const { data } = await api.post<ApiResponse<Reply>>('/copilot/chat', {
        question, consent, month, comparable, provider, history,
      }, { signal: request.signal });
      if (!request.signal.aborted) {
        setTurns(current => [...current, { question, ...data.data }]);
        setInput('');
      }
    } catch (failure) {
      if (!request.signal.aborted) {
        const response = (failure as { response?: { data?: ApiResponse<unknown> } }).response;
        setError(response?.data?.error?.message ?? 'Copilot could not answer right now. Try again.');
      }
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setPending(undefined);
      }
    }
  }

  return (
    <section aria-labelledby="copilot-chat-title" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="copilot-chat-title" className="text-lg font-bold text-slate-900">Chat with Copilot</h2>
        {(turns.length > 0 || pending) && <button type="button" onClick={clear} className="text-sm font-semibold text-blue-700 underline">New chat</button>}
      </div>
      {availability.isPending && <p role="status" className="text-sm text-slate-600">Checking chat availability…</p>}
      {availability.isError && <p role="alert" className="text-sm text-slate-700">
        Could not check AI chat availability. <button type="button" className="text-blue-700 underline" onClick={() => void availability.refetch()}>Retry</button>
      </p>}
      {availability.data?.available === false && <p className="text-sm text-slate-700">AI chat is unavailable on this server. You can still use the spending shortcuts below.</p>}
      {availability.data?.available && (
        <>
          {!turns.length && !pending && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map(question => (
                <button key={question} type="button" onClick={() => setInput(question)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                  {question}
                </button>
              ))}
            </div>
          )}
          <div role="log" aria-label="Copilot conversation" className="space-y-4">
            {turns.map((turn, index) => (
              <article key={index} className="space-y-3">
                <p className="ml-auto w-fit max-w-full whitespace-pre-wrap break-words rounded-xl bg-blue-50 px-4 py-2 text-sm text-slate-900">
                  <span className="sr-only">You: </span>{turn.question}
                </p>
                <div className="space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-900">
                  <p className="whitespace-pre-wrap break-words"><span className="sr-only">Copilot: </span>{turn.answer}</p>
                  {turn.sources.length > 0 && (
                    <ul aria-label="Sources" className="flex flex-wrap gap-2">
                      {turn.sources.map(source => (
                        <li key={source.id}>
                          <Link className="block break-words rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-blue-700 underline"
                            to={source.path}>{source.label}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
            {pending && <p className="break-words text-sm text-slate-700"><strong>{pending}</strong><br />Checking your question…</p>}
          </div>
          <form className="grid gap-3" onSubmit={event => void submit(event)}>
            <label className="grid gap-1 text-sm font-medium">
              {turns.length ? 'Ask a follow-up' : 'Ask a question'}
              <textarea rows={2} value={input} onChange={event => setInput(event.target.value)} maxLength={1800}
                disabled={!!pending} placeholder="How much did I spend on groceries last month?"
                className="min-w-0 resize-y rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={consent} disabled={!!pending} onChange={event => setConsentedProvider(event.target.checked ? provider : undefined)} />
              Allow Copilot to send this chat and the financial data it needs to {provider}.
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={!consent || !input.trim() || !!pending}
              className="w-fit rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {pending ? 'Checking…' : 'Send'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
