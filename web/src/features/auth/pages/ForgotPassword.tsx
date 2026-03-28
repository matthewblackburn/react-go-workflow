import { Loader2, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import EmailPassword from 'supertokens-web-js/recipe/emailpassword';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await EmailPassword.sendPasswordResetEmail({
        formFields: [{ id: 'email', value: email }],
      });

      if (response.status === 'OK') {
        setSent(true);
      } else if (response.status === 'FIELD_ERROR') {
        setError(response.formFields.map((f) => f.error).join('. '));
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Workflow className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-bold text-2xl">Reset password</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {sent
              ? 'Check your email for a reset link'
              : 'Enter your email to receive a password reset link'}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 text-center">
              <p className="text-sm">
                If an account exists for <strong>{email}</strong>, you'll receive an email with
                instructions to reset your password.
              </p>
            </div>
            <p className="text-center text-muted-foreground text-sm">
              <Link to="/login" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              {error && <p className="text-center text-destructive text-sm">{error}</p>}

              <Button type="submit" className="w-full" size="lg" disabled={loading || !email.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send reset link'
                )}
              </Button>
            </form>

            <p className="text-center text-muted-foreground text-sm">
              <Link to="/login" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
