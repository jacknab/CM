/**
 * ReviewFeedback — step 2 of the SMS review-request flow, reached only when
 * the customer picked "Bad" on ReviewGate.tsx. Adapted from the standalone
 * /opt/review app's ReviewWithRatingPage.tsx. Collects a star rating,
 * written comment, and optional photos — stored privately, never redirected
 * to a public review site.
 */
import { useState, useEffect, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Star, ImagePlus, X, CheckCircle, Loader2 } from 'lucide-react';
import './ReviewWithRatingPage.css';

const RATING_MESSAGES: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Not Good',
  2: "Could've been better",
  3: 'OK',
  4: 'Good',
  5: 'Great',
};

const RATING_VALUES: ReadonlyArray<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

interface ValidateResponse {
  valid: boolean;
  error?: string;
  storeName?: string;
}

function validateComment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const wordCount = trimmed.split(/\s+/).filter((word) => word.length > 0).length;
  if (wordCount < 4) return false;

  const suspiciousPatterns = [/^(.)\1+$/, /^[a-zA-Z]+$/];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(trimmed.toLowerCase())) return false;
  }

  const harmfulKeywords = ['script', 'javascript:', 'data:', 'http', 'www.', '.com', '.org', '.net'];
  const lowerComment = trimmed.toLowerCase();
  if (harmfulKeywords.some((keyword) => lowerComment.includes(keyword))) return false;

  return true;
}

function sanitizeComment(text: string): string {
  return text
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/www\.[^\s]+/gi, '')
    .substring(0, 500);
}

function StarButton({
  selected,
  onClick,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`review-feedback__star ${selected ? 'review-feedback__star--selected' : ''}`}
    >
      <Star size={24} />
    </button>
  );
}

export default function ReviewFeedback() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
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

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') setPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleSubmit = async () => {
    if (!validateComment(comment)) {
      setError('Please enter at least 4 words for your review');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Upload the photo first (if any) via the existing review-photo
      // endpoint, then submit the review with just its URL.
      let photoUrl: string | undefined;
      if (photoFile) {
        const form = new FormData();
        form.append('photo', photoFile);
        const uploadRes = await fetch('/api/reviews/upload-photo', { method: 'POST', body: form });
        const uploadData = await uploadRes.json();
        if (uploadRes.ok && uploadData.url) photoUrl = uploadData.url;
      }

      const res = await fetch('/api/reviews/gate/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          tier: 'bad',
          rating,
          comment: sanitizeComment(comment.trim()),
          photoUrl,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to submit review. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="review-feedback review-feedback--centered">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (error && !storeName) {
    return (
      <div className="review-feedback review-feedback--centered">
        <div className="review-feedback__panel review-feedback__panel--message">
          <p className="review-feedback__error">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="review-feedback review-feedback--centered">
        <div className="review-feedback__panel review-feedback__panel--message">
          <CheckCircle className="review-feedback__success-icon" size={48} />
          <h2 className="review-feedback__success-title">Your feedback has been sent to the business.</h2>
          <p className="review-feedback__success-copy">Thank you for letting us know.</p>
          <p className="review-feedback__note">You may close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="review-feedback">
      <div className="review-feedback__panel">
        <div className="review-feedback__hero">
          <h1 className="review-feedback__title">{storeName ? storeName.toUpperCase() : 'LOADING...'}</h1>
        </div>

        {error && <p className="review-feedback__error review-feedback__error--inline">{error}</p>}

        <div className="review-feedback__divider" />

        <div className="review-feedback__card">
          <h2 className="review-feedback__heading">How would you rate your experience?</h2>
          <div className="review-feedback__stars-row">
            <div className="review-feedback__stars">
              {RATING_VALUES.map((star) => (
                <StarButton
                  key={star}
                  selected={star <= rating}
                  onClick={() => setRating(star)}
                  disabled={isSubmitting}
                />
              ))}
            </div>
            <span className="review-feedback__rating-copy">{RATING_MESSAGES[rating]}</span>
          </div>

          <h2 className="review-feedback__heading review-feedback__heading--spaced">Tell us about your experience</h2>
          <p className="review-feedback__subheading">A few things to consider in your review</p>
          <div className="review-feedback__chips">
            <span className="review-feedback__chip">Service Requested</span>
            <span className="review-feedback__chip">Quality</span>
            <span className="review-feedback__chip">Vibe</span>
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Start your review..."
            className="review-feedback__textarea"
            disabled={isSubmitting}
          />
          <p className="review-feedback__helper">Please share at least a few words about your experience.</p>
        </div>

        <div className="review-feedback__upload-section">
          <p className="review-feedback__section-label">Attach a photo</p>
          {!photoPreview && (
            <button
              type="button"
              onClick={() => document.getElementById('photo-upload')?.click()}
              className="review-feedback__upload-button"
            >
              <ImagePlus size={24} />
              <span>Add a photo</span>
            </button>
          )}
          <input
            type="file"
            id="photo-upload"
            className="review-feedback__file-input"
            accept="image/*"
            onChange={handleImageSelect}
            disabled={isSubmitting}
          />
        </div>

        {photoPreview && (
          <div className="review-feedback__preview-grid">
            <div className="review-feedback__preview-item">
              <img src={photoPreview} alt="Preview" className="review-feedback__preview-image" />
              <button type="button" onClick={removeImage} className="review-feedback__remove-image">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !validateComment(comment)}
          className="review-feedback__submit"
        >
          {isSubmitting ? 'Sending...' : 'Send Feedback'}
        </button>
        <div className="mt-2 text-sm text-gray-500">
          {!validateComment(comment) && comment.trim().length > 0 && (
            <span className="text-red-500">At least 4 words required</span>
          )}
        </div>
      </div>
    </div>
  );
}
