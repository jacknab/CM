/**
 * ReviewGate — step 1 of the SMS review-request flow.
 *
 * Adapted from the standalone /opt/review app's MyReview.tsx. A customer
 * lands here from a one-time SMS link (/review/:token) and picks Great /
 * Just OK / Bad. Great and Just OK redirect out to the store's real
 * Google/Yelp review page; Bad continues to ReviewFeedback.tsx instead of
 * ever reaching a public review site.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, Frown, Meh, SmilePlus, Loader2 } from 'lucide-react';
import './MyReview.css';

interface ValidateResponse {
  valid: boolean;
  error?: string;
  storeId?: number;
  appointmentId?: number | null;
  storeName?: string;
  customerName?: string | null;
  externalReviewUrl?: string | null;
}

const RATING_OPTIONS = [
  { value: 'great', label: 'Great', icon: SmilePlus, toneClassName: 'my-review__option--great' },
  { value: 'ok', label: 'Just OK', icon: Meh, toneClassName: 'my-review__option--okay' },
  { value: 'bad', label: 'Bad', icon: Frown, toneClassName: 'my-review__option--bad' },
] as const;

export default function ReviewGate() {
  const navigate = useNavigate();
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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
          setStoreName(data.storeName || '');
        }
      } catch {
        setError('This review link is no longer valid');
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, [token]);

  const handleSubmit = async (rating: (typeof RATING_OPTIONS)[number]['value']) => {
    if (rating === 'bad') {
      navigate(`/review/${token}/feedback`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/reviews/gate/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, tier: rating }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to submit review. Please try again.');
        setIsSubmitting(false);
        return;
      }
      if (data.redirectUrl) {
        window.location.assign(data.redirectUrl);
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Failed to submit review. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="my-review my-review--centered">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-review my-review--centered">
        <div className="my-review__panel my-review__panel--message">
          <p className="my-review__error">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="my-review my-review--centered">
        <div className="my-review__panel my-review__panel--message">
          <CheckCircle className="my-review__success-icon" size={48} />
          <h2 className="my-review__success-title">Thank you for your feedback!</h2>
          <p className="my-review__success-copy">Your review has been submitted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-review">
      <div className="my-review__panel">
        <div className="my-review__hero">
          <div className="my-review__eyebrow">Customer Feedback</div>
          <h1 className="my-review__title">{storeName ? storeName.toUpperCase() : 'LOADING...'}</h1>
          <p className="my-review__subtitle">How would you rate the service you received?</p>
        </div>

        {error && <p className="my-review__error my-review__error--inline">{error}</p>}

        <div className="my-review__options">
          {RATING_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                onClick={() => handleSubmit(option.value)}
                disabled={isSubmitting}
                className={`my-review__option ${option.toneClassName}`}
              >
                <div className="my-review__option-copy">
                  <span className="my-review__option-label">{option.label}</span>
                </div>
                <div className="my-review__option-icon">
                  <Icon size={30} strokeWidth={1.9} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
