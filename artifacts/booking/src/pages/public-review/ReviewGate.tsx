/**
 * ReviewGate — Certxa's native, direct-to-public review form.
 *
 * A customer lands here from a one-time SMS/email review-request link
 * (/review/:token) whenever their salon has no Google review destination
 * configured (see routes/reviewGating.ts's GET /review/:token branch — a
 * store WITH a Google destination redirects straight there instead, and
 * never reaches this page). Every rating (1-5) is treated identically and
 * always published — no "rate us privately first" step. An earlier version
 * of this page implemented a great/ok/bad chooser that routed low ratings to
 * a separate private-feedback page instead of a public review; that pattern
 * was deliberately replaced, not extended (see ReviewFeedback.tsx's removal).
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ReviewStarForm, type ReviewStarFormSubmitData } from '@/components/review/ReviewStarForm';

interface ValidateResponse {
  valid: boolean;
  error?: string;
  storeName?: string | null;
  customerName?: string | null;
  serviceName?: string | null;
  staffName?: string | null;
  date?: string | null;
}

export default function ReviewGate() {
  const { id: token } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ValidateResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setError('No review link provided');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/reviews/gate/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data: ValidateResponse = await res.json();
        if (!data.valid) {
          setError(data.error || 'This review link is no longer valid');
        } else {
          setContext(data);
        }
      } catch {
        setError('This review link is no longer valid');
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, [token]);

  async function handleSubmit(data: ReviewStarFormSubmitData) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/reviews/gate/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          rating: data.rating,
          comment: data.comment || undefined,
          photoUrl: data.photoUrl || undefined,
        }),
      });
      const result = await res.json();
      if (!result.ok) {
        setSubmitError(result.error || 'Failed to submit review. Please try again.');
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError('Failed to submit review. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 max-w-md w-full text-center space-y-3">
          <p className="text-lg font-semibold">Review link not found</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 max-w-md w-full text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
          <div>
            <p className="text-xl font-bold">Thank you!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your review has been submitted successfully.
            </p>
          </div>
          {context?.storeName && (
            <p className="text-sm text-muted-foreground">
              We appreciate your feedback at <strong>{context.storeName}</strong>.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
      <Card className="p-8 max-w-md w-full space-y-6 shadow-lg">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-xl font-bold">{context?.storeName || 'Your Experience'}</p>
          <p className="text-sm text-muted-foreground">
            How was your visit{context?.customerName ? `, ${context.customerName.split(' ')[0]}` : ''}?
          </p>
        </div>

        {/* Appointment summary */}
        {(context?.serviceName || context?.staffName || context?.date) && (
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            {context.serviceName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium">{context.serviceName}</span>
              </div>
            )}
            {context.staffName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">With</span>
                <span className="font-medium">{context.staffName}</span>
              </div>
            )}
            {context.date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {new Date(context.date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        <ReviewStarForm onSubmit={handleSubmit} submitting={submitting} submitError={submitError} />
      </Card>
    </div>
  );
}
