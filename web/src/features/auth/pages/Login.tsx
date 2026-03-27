import { Workflow } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth/auth-context';

export default function Login() {
  const { setToken } = useAuth();
  const [token, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleDevLogin() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/v1/dev/token', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate token');
      const data = await res.json();
      setToken(data.token);
    } catch {
      setError('Could not generate dev token. Is the API running?');
    } finally {
      setLoading(false);
    }
  }

  function handleManualToken(e: React.FormEvent) {
    e.preventDefault();
    if (token.trim()) {
      setToken(token.trim());
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Workflow className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Workflow Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to get started</p>
        </div>

        <Button onClick={handleDevLogin} disabled={loading} className="w-full" size="lg">
          {loading ? 'Generating...' : 'Quick Dev Login'}
        </Button>

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or paste a token</span>
          </div>
        </div>

        <form onSubmit={handleManualToken} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="token" className="text-xs">
              JWT Token
            </Label>
            <Input
              id="token"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <Button type="submit" variant="outline" className="w-full" disabled={!token.trim()}>
            Use Token
          </Button>
        </form>
      </div>
    </div>
  );
}
