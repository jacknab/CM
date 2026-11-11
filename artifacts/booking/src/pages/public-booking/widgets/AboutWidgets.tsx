/**
 * About widgets (owner, 2026-11-11): name and rating, the about text, the team, hours,
 * cancellation policy, contact and reviews. Moved unchanged from SoloTheme.tsx.
 */
import { Star, ExternalLink } from "lucide-react";
import { C, ReviewPhotos, ReviewerAvatar, firstName } from "./shared";
import { useSite } from "./useSoloSite";

/** Photo, name, rating and the about text. */
export function AboutIntro() {
  const { store, reviews, salonName, isGoogleSourced, reviewCount, avgRating } = useSite();
  return (
    <>
          {store.bookingSite?.aboutImage && (
            <img src={store.bookingSite.aboutImage} alt={salonName} data-testid="solo-about-photo" className="mx-auto mb-4 h-44 w-44 rounded-2xl object-cover shadow-sm" />
          )}
          <h2 id="about-heading" className="text-3xl font-semibold sm:text-4xl" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: C.ink900 }} itemProp="name">
            {salonName}
          </h2>

          {reviewCount > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-center gap-1" role="img" aria-label={`${Number(avgRating.toFixed(1))} stars from ${reviewCount} ${isGoogleSourced ? "Google " : ""}reviews`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className="h-5 w-5" aria-hidden="true" style={{ color: "#F59E0B", fill: n <= Math.round(avgRating) ? "#F59E0B" : "none" }} />
                ))}
                <span className="ml-1.5 text-sm" style={{ color: C.ink600 }}>({reviewCount.toLocaleString()} {isGoogleSourced ? "Google " : ""}{reviewCount === 1 ? "Review" : "Reviews"})</span>
              </div>
              {reviews.length > 0 && (
                <button
                  type="button"
                  onClick={() => document.getElementById("about-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="mt-1.5 text-sm font-medium underline underline-offset-2"
                  style={{ color: C.ink800 }}
                >
                  See all reviews
                </button>
              )}
            </div>
          )}

          {store.bookingSite?.about && (
            <p className="mt-6 whitespace-pre-line border-t pt-6 text-base leading-relaxed" style={{ color: C.ink700, borderColor: C.cream200 }} itemProp="description">
              {store.bookingSite.about}
            </p>
          )}
    </>
  );
}

/** Our Team, with Book with …, when two or more can be booked. */
export function TeamWidget() {
  const { team, setStaffChoice, teamShown, bookingOff, bookNow } = useSite();
  return (
    <>
          {teamShown && (
            <div className="mt-8 border-t pt-7" style={{ borderColor: C.cream200 }} data-testid="solo-team">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Our Team</h3>
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
                {team.map((m) => (
                  <div key={m.id} className="flex flex-col items-center text-center" data-testid={`solo-team-${m.id}`}>
                    {m.avatarUrl
                      ? <img src={m.avatarUrl} alt={m.name} loading="lazy" className="h-20 w-20 rounded-full object-cover" />
                      : <span className="grid h-20 w-20 place-items-center rounded-full text-2xl font-semibold" style={{ background: C.cream100, color: C.ink700 }} aria-hidden="true">{m.name.trim().charAt(0).toUpperCase()}</span>}
                    <p className="mt-2 text-[15px] font-semibold" style={{ color: C.ink900 }}>{m.name}</p>
                    {m.role && <p className="text-xs" style={{ color: C.ink500 }}>{m.role}</p>}
                    {m.bio && <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug" style={{ color: C.ink600 }}>{m.bio}</p>}
                    {!bookingOff && (
                      <button
                        type="button"
                        onClick={() => { setStaffChoice(m.id); bookNow(); }}
                        data-testid={`solo-book-with-${m.id}`}
                        className="mt-2.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
                        style={{ borderColor: C.gold700, color: C.gold700 }}
                      >
                        Book with {firstName(m.name)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
    </>
  );
}

/** Business hours. */
export function HoursWidget() {
  const { hours } = useSite();
  return (
    <>
          {hours.length > 0 && (
            <div className="mt-8 border-t pt-7" style={{ borderColor: C.cream200 }}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Business Hours</h3>
              <dl className="mx-auto mt-4 max-w-xs space-y-2">
                {hours.map((row) => (
                  <div key={row.day} className="flex justify-between gap-6 text-sm">
                    <dt style={{ color: row.time === "Closed" ? C.ink400 : C.ink800 }}>{row.day}</dt>
                    <dd style={{ color: row.time === "Closed" ? C.ink400 : C.ink800 }}>{row.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
    </>
  );
}

/** The cancellation policy. */
export function PolicyWidget() {
  const { cancelPolicyText } = useSite();
  return (
    <>
          {cancelPolicyText && (
            <div className="mt-8 border-t pt-7" style={{ borderColor: C.cream200 }}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Cancellation Policy</h3>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed" style={{ color: C.ink700 }}>{cancelPolicyText}</p>
            </div>
          )}
    </>
  );
}

/** Address, directions, phone and Send a message. */
export function ContactWidget() {
  const { store, phoneHref, phoneLabel, directionsUrl } = useSite();
  return (
    <>
          {/* Contact: always shown, for "Send a message" (owner, 2026-11-07). */}
          {(
            <div className="mt-8 space-y-2 border-t pt-7 text-sm" style={{ borderColor: C.cream200 }}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>Contact</h3>
              {store.address && (
                <>
                  <address className="not-italic leading-relaxed" style={{ color: C.ink700 }} itemProp="address">{store.address}</address>
                  <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: C.gold700 }}>
                    Get directions
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </>
              )}
              {store.phone && <a href={phoneHref} className="block" style={{ color: C.ink700 }} itemProp="telephone">{phoneLabel}</a>}
              <a href="#message" className="inline-block pt-1 font-semibold" style={{ color: C.gold700 }} data-testid="solo-send-message">Send a message</a>
            </div>
          )}
    </>
  );
}

/** All the reviews, Google's or Certxa's. */
export function ReviewsWidget() {
  const { store, reviews, salonName, isGoogleSourced } = useSite();
  return (
    <>
          {reviews.length > 0 && (
            <div id="about-reviews" className="mt-8 scroll-mt-32 border-t pt-7 text-left" style={{ borderColor: C.cream200 }}>
              <h3 className="text-center text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: C.ink800 }}>{isGoogleSourced ? "Reviews from Google" : <>Ratings &amp; Reviews</>}</h3>
              <div className="mt-2 divide-y" style={{ borderColor: C.cream200 }}>
                {reviews.map((r) => {
                  const rating = Number(r.rating ?? 5);
                  const who = r.customerName?.trim() || "Verified client";
                  const when = r.reviewCreateTime
                    ? new Date(r.reviewCreateTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: store.timezone || "UTC" })
                    : null;
                  return (
                    <article key={r.id} className="py-5" data-testid="solo-review">
                      <div className="flex items-center gap-3">
                        <ReviewerAvatar name={who} photoUrl={r.reviewerPhotoUrl} />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold" style={{ color: C.ink900 }}>{who}</p>
                          {r.serviceName && <p className="truncate text-[13px]" style={{ color: C.ink600 }}>{r.serviceName}</p>}
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2 text-[13px]" style={{ color: C.ink600 }}>
                        <span className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className="h-4 w-4" aria-hidden="true" style={{ color: "#F59E0B", fill: n <= rating ? "#F59E0B" : "none" }} />
                          ))}
                        </span>
                        <span className="font-semibold" style={{ color: C.ink900 }}>{rating.toFixed(1)}</span>
                        {when && <span>· {when}</span>}
                        {r.source === "google" && <span data-testid="solo-review-google">· Posted on Google</span>}
                      </div>
                      {r.reviewText && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed" style={{ color: C.ink800 }}>{r.reviewText}</p>}
                      <ReviewPhotos urls={r.reviewImageUrls} large />
                      {r.ownerResponse && (
                        <p className="mt-3 rounded-xl px-3 py-2 text-sm leading-relaxed" style={{ background: C.cream50, color: C.ink700 }}>
                          <span className="font-semibold">Reply from {salonName}: </span>{r.ownerResponse}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
    </>
  );
}
