import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    const res = await signInWithEmail(email.trim());
    if (res.error) {
      setError(res.error);
      setState('idle');
    } else {
      setState('sent');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-green-800">{t('app.title')}</h1>
          <button
            type="button"
            onClick={() => void i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
            className="rounded border px-2 py-1 text-sm"
          >
            {t('language.switch')}
          </button>
        </div>
        {state === 'sent' ? (
          <p role="status" className="mt-4 text-gray-700">
            {t('login.sent', { email })}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              {t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {t('login.error', { message: error })}
              </p>
            )}
            <button
              type="submit"
              disabled={state === 'sending'}
              className="w-full rounded bg-green-800 px-3 py-2 font-medium text-white disabled:opacity-60"
            >
              {state === 'sending' ? t('login.sending') : t('login.submit')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
