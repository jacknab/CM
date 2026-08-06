import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Star,
  Send,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
} from "lucide-react";
import axios from "axios";
import { GoogleReview, GoogleReviewResponse } from "@shared/schema";

interface ReviewDetailProps {
  review: GoogleReview;
  storeId: number;
  onClose: () => void;
  onRefresh: () => void;
}

type ActionState = "idle" | "submitting" | "publishing" | "deleting" | "editing";

export function ReviewResponseDialog({
  review,
  storeId,
  onClose,
  onRefresh,
}: ReviewDetailProps) {
  const [responses, setResponses]               = useState<GoogleReviewResponse[]>([]);
  const [responseText, setResponseText]         = useState("");
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [actionState, setActionState]           = useState<ActionState>("idle");
  const [actioningId, setActioningId]           = useState<number | null>(null);
  const [errorMsg, setErrorMsg]                 = useState<string | null>(null);
  const [successMsg, setSuccessMsg]             = useState<string | null>(null);

  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [suggestions, setSuggestions]             = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen]     = useState(false);
  const [suggestionsError, setSuggestionsError]   = useState<string | null>(null);

  useEffect(() => {
    loadResponses();
  }, [review.id]);

  const loadResponses = async () => {
    try {
      setLoadingResponses(true);
      const res = await axios.get(`/api/google-business/reviews/${storeId}/${review.id}`);
      setResponses(res.data.responses ?? []);
    } catch {
      setErrorMsg("Couldn't load responses. Please try again.");
    } finally {
      setLoadingResponses(false);
    }
  };

  const clearMessages = () => { setErrorMsg(null); setSuccessMsg(null); };

  // ── AI suggestions ────────────────────────────────────────────────────────

  const handleSuggestReplies = async () => {
    if (loadingSuggestions) return;
    if (suggestionsOpen && suggestions.length > 0) { setSuggestionsOpen(false); return; }

    try {
      setLoadingSuggestions(true);
      setSuggestionsError(null);
      setSuggestionsOpen(true);
      setSuggestions([]);
      const res = await axios.post(`/api/google-business/suggest-reply/${storeId}`, {
        reviewText:   review.reviewText,
        rating:       review.rating,
        customerName: review.customerName,
      });
      setSuggestions(res.data.suggestions ?? []);
    } catch {
      setSuggestionsError("Couldn't generate suggestions. Please try again.");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleUseSuggestion = (text: string) => {
    setResponseText(text);
    setSuggestionsOpen(false);
    setTimeout(() => document.getElementById("review-response-textarea")?.focus(), 100);
  };

  // ── Submit new draft ──────────────────────────────────────────────────────

  const handleSubmitResponse = async () => {
    if (!responseText.trim()) return;
    clearMessages();
    try {
      setActionState("submitting");
      await axios.post("/api/google-business/review-response", {
        googleReviewId: review.id,
        storeId,
        responseText: responseText.trim(),
      });
      setResponseText("");
      setSuccessMsg("Draft saved.");
      await loadResponses();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? "Failed to save draft. Please try again.");
    } finally {
      setActionState("idle");
    }
  };

  // ── Publish ───────────────────────────────────────────────────────────────

  const handlePublishResponse = async (responseId: number) => {
    clearMessages();
    try {
      setActionState("publishing");
      setActioningId(responseId);
      await axios.post(`/api/google-business/review-response/${responseId}/publish`);
      setSuccessMsg("Response published to Google.");
      await loadResponses();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? "Failed to publish. Please try again.");
    } finally {
      setActionState("idle");
      setActioningId(null);
    }
  };

  // ── Edit draft ────────────────────────────────────────────────────────────

  const startEditing = (response: GoogleReviewResponse) => {
    setEditingId(response.id);
    setEditingText(response.responseText ?? "");
    clearMessages();
  };

  const cancelEditing = () => { setEditingId(null); setEditingText(""); };

  const handleSaveEdit = async (responseId: number) => {
    if (!editingText.trim()) return;
    clearMessages();
    try {
      setActionState("editing");
      setActioningId(responseId);
      await axios.patch(`/api/google-business/review-response/${responseId}`, {
        responseText: editingText.trim(),
      });
      setSuccessMsg("Draft updated.");
      setEditingId(null);
      setEditingText("");
      await loadResponses();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? "Failed to update draft.");
    } finally {
      setActionState("idle");
      setActioningId(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDeleteResponse = async (responseId: number) => {
    clearMessages();
    try {
      setActionState("deleting");
      setActioningId(responseId);
      await axios.delete(`/api/google-business/review-response/${responseId}`);
      setConfirmDeleteId(null);
      setSuccessMsg("Response deleted.");
      await loadResponses();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? "Failed to delete. Please try again.");
    } finally {
      setActionState("idle");
      setActioningId(null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const renderStarRating = (rating: number) => (
    <div className="flex items-center gap-1">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={16} className={i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} />
      ))}
      <span className="ml-2 text-sm font-medium">{rating}/5</span>
    </div>
  );

  const busy = actionState !== "idle";
  const showResponseForm =
    review.responseStatus === "not_responded" ||
    !responses.some((r) => r.responseStatus === "approved");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Details</DialogTitle>
        </DialogHeader>

        {/* ── Original Review ─────────────────────────────────────────────── */}
        <div className="space-y-3 border-b pb-5">
          <div>
            <div className="mb-1">{renderStarRating(review.rating)}</div>
            <h3 className="font-semibold text-lg">{review.customerName}</h3>
            <p className="text-sm text-gray-500">
              {review.reviewCreateTime
                ? new Date(review.reviewCreateTime).toLocaleDateString()
                : "Date unknown"}
            </p>
          </div>
          {review.reviewText ? (
            <p className="text-gray-700 leading-relaxed">{review.reviewText}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No written review — rating only.</p>
          )}
          {review.reviewImageUrls && (() => {
            try {
              const urls = JSON.parse(review.reviewImageUrls);
              return (
                <div className="flex gap-2 flex-wrap">
                  {urls.map((url: string, i: number) => (
                    <img key={i} src={url} alt="Review" className="w-20 h-20 object-cover rounded" />
                  ))}
                </div>
              );
            } catch { return null; }
          })()}
        </div>

        {/* ── Feedback banners ────────────────────────────────────────────── */}
        {errorMsg && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
            <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setErrorMsg(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            <CheckCircle2 size={15} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ── Responses list ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Responses</h4>
            <Badge variant={review.responseStatus === "responded" ? "default" : "outline"}>
              {review.responseStatus === "responded" ? (
                <><CheckCircle2 size={13} className="mr-1" />Responded</>
              ) : (
                <><AlertCircle size={13} className="mr-1" />No Response</>
              )}
            </Badge>
          </div>

          {loadingResponses ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="animate-spin text-gray-400" size={20} />
            </div>
          ) : responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No responses yet.</p>
          ) : (
            <div className="space-y-3">
              {responses.map((response) => {
                const isEditing   = editingId === response.id;
                const isActioning = actioningId === response.id && busy;
                const isPublished = response.responseStatus === "approved";
                const isPending   = response.responseStatus === "pending";

                return (
                  <Card
                    key={response.id}
                    className={
                      isPublished ? "border-green-200 bg-green-50/60" :
                      response.responseStatus === "rejected" ? "border-red-200 bg-red-50/60" :
                      "border-gray-200"
                    }
                  >
                    <CardContent className="pt-4 space-y-3">
                      {/* Header: badge + actions */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant={isPublished ? "default" : "outline"} className="text-xs">
                          {isPublished ? "Published to Google" :
                           response.responseStatus === "rejected" ? "Rejected" :
                           "Draft"}
                        </Badge>

                        {!isEditing && (
                          <div className="flex items-center gap-1.5">
                            {/* Edit — only on pending drafts */}
                            {isPending && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditing(response)}
                                disabled={busy}
                                className="gap-1 text-xs h-7 px-2 text-gray-500 hover:text-gray-700"
                              >
                                <Pencil size={12} />
                                Edit
                              </Button>
                            )}

                            {/* Publish — only on pending drafts */}
                            {isPending && (
                              <Button
                                size="sm"
                                onClick={() => handlePublishResponse(response.id)}
                                disabled={busy}
                                className="gap-1.5 h-7 text-xs"
                              >
                                {isActioning && actionState === "publishing" ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Send size={12} />
                                )}
                                Publish to Google
                              </Button>
                            )}

                            {/* Delete */}
                            {confirmDeleteId === response.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-red-600">Delete?</span>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 text-xs px-2"
                                  onClick={() => handleDeleteResponse(response.id)}
                                  disabled={busy}
                                >
                                  {isActioning && actionState === "deleting" ? (
                                    <Loader2 size={11} className="animate-spin" />
                                  ) : "Yes"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs px-2"
                                  onClick={() => setConfirmDeleteId(null)}
                                >
                                  No
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteId(response.id)}
                                disabled={busy}
                                className="h-7 px-2 text-gray-400 hover:text-red-500"
                              >
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Body: edit mode or read mode */}
                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            rows={4}
                            maxLength={5000}
                            className="text-sm"
                            autoFocus
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">{editingText.length}/5000</span>
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={busy} className="h-7 text-xs">
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleSaveEdit(response.id)}
                                disabled={!editingText.trim() || busy}
                                className="h-7 text-xs gap-1"
                              >
                                {isActioning && actionState === "editing" ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : null}
                                Save Changes
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {response.responseText}
                        </p>
                      )}

                      {isPublished && (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          This reply is live on your Google Business Profile.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── New response form ──────────────────────────────────────────── */}
          {showResponseForm && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <h5 className="font-medium text-sm">Write a Response</h5>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSuggestReplies}
                  disabled={loadingSuggestions}
                  className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800 text-xs h-8"
                >
                  {loadingSuggestions ? (
                    <><Loader2 size={12} className="animate-spin" />Generating…</>
                  ) : suggestionsOpen && suggestions.length > 0 ? (
                    <><ChevronUp size={12} />Hide suggestions</>
                  ) : (
                    <><Sparkles size={12} />AI suggestions</>
                  )}
                </Button>
              </div>

              {/* AI Suggestions panel */}
              {suggestionsOpen && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                  <p className="text-xs font-medium text-violet-700 flex items-center gap-1">
                    <Sparkles size={11} />
                    AI-generated — review before using
                  </p>

                  {loadingSuggestions && suggestions.length === 0 && (
                    <div className="flex items-center gap-2 py-3 text-sm text-violet-600">
                      <Loader2 size={13} className="animate-spin" />
                      Writing suggestions based on this review…
                    </div>
                  )}

                  {suggestionsError && (
                    <p className="text-sm text-red-600">{suggestionsError}</p>
                  )}

                  {suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleUseSuggestion(suggestion)}
                      className="w-full text-left rounded-md border border-violet-200 bg-white px-3 py-2.5 text-sm text-gray-700 hover:border-violet-400 hover:bg-violet-50 transition-colors group relative"
                    >
                      <p className="pr-16 leading-relaxed">{suggestion}</p>
                      <span className="absolute right-2.5 top-2.5 text-xs font-medium text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity bg-violet-100 rounded px-1.5 py-0.5">
                        Use this
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <Textarea
                id="review-response-textarea"
                placeholder="Write your response to this review…"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                maxLength={5000}
                rows={4}
                className="text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{responseText.length}/5000</span>
                <Button
                  onClick={handleSubmitResponse}
                  disabled={!responseText.trim() || busy}
                  size="sm"
                  className="gap-2"
                >
                  {actionState === "submitting" ? (
                    <><Loader2 size={13} className="animate-spin" />Saving…</>
                  ) : "Save as Draft"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
