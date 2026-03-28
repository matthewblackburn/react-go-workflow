import { Loader2, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmailPassword from 'supertokens-web-js/recipe/emailpassword';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !token) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await EmailPassword.submitNewPassword({
        formFields: [{ id: 'password', value: password }],
      });

      if (response.status === 'OK') {
        setSuccess(true);
      } else if (response.status === 'RESET_PASSWORD_INVALID_TOKEN_ERROR') {
        setError('This reset link has expired or already been used. Please request a new one.');
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

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-6 p-6 text-center">
          <p className="text-destructive text-sm">Invalid reset link. No token found.</p>
          <Link to="/forgot-password" className="font-medium text-primary text-sm hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Workflow className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-bold text-2xl">Set new password</h1>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 text-center">
              <p className="text-sm">Your password has been reset successfully.</p>
            </div>
            <p className="text-center">
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in with your new password
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            {error && <p className="text-center text-destructive text-sm">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !password || !confirmPassword}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset password'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
