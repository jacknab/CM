import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';

type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived' | string;

interface CampaignStep {
  id?: string | number;
  stepOrder?: number;
  delayMinutes?: number;
  subject: string;
  previewText: string;
  htmlTemplate: string;
  textTemplate: string;
  ctaLabel: string;
  ctaUrl: string;
  [key: string]: unknown;
}

interface Campaign {
  id: string | number;
  name?: string;
  description?: string;
  category?: string;
  triggerEvent?: string;
  audienceRule?: Record<string, unknown>;
  fromName?: string;
  replyTo?: string;
  status?: CampaignStatus;
  stepCount?: number;
  totalSteps?: number;
  enrolled?: number;
  enrolledCount?: number;
  sent?: number;
  sentCount?: number;
  delivered?: number;
  deliveredCount?: number;
  opened?: number;
  openedCount?: number;
  clicked?: number;
  clickedCount?: number;
  converted?: number;
  convertedCount?: number;
  updatedAt?: string;
  createdAt?: string;
  steps?: CampaignStep[];
  [key: string]: unknown;
}

interface CampaignStats {
  enrolled?: number;
  sent?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  converted?: number;
  deliveryRate?: number;
  openRate?: number;
  clickRate?: number;
  conversionRate?: number;
  [key: string]: unknown;
}

interface DetailResponse {
  campaign: Campaign;
  stats?: CampaignStats;
}

interface Totals {
  campaigns?: number;
  active?: number;
  enrolled?: number;
  delivered?: number;
  sent?: number;
  [key: string]: unknown;
}

interface Draft {
  name: string;
  description: string;
  category: string;
  triggerEvent: string;
  audienceRule: Record<string, unknown>;
  fromName: string;
  replyTo: string;
  steps: CampaignStep[];
}

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pickNumber = (record: Record<string, unknown> | undefined, ...keys: string[]) => {
  if (!record) return 0;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return numberValue(record[key]);
  }
  return 0;
};

const toCampaign = (value: unknown): Campaign => {
  const campaign = (value && typeof value === 'object' ? value : {}) as Campaign;
  const raw = campaign as Record<string, unknown>;
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  return {
    ...campaign,
    id: campaign.id ?? campaign._id ?? '',
    category: campaign.category ?? String(raw.category ?? 'lifecycle'),
    triggerEvent: campaign.triggerEvent ?? String(raw.trigger_event ?? 'signup'),
    audienceRule: campaign.audienceRule ?? (raw.audience_rule as Record<string, unknown> | undefined) ?? {},
    fromName: campaign.fromName ?? String(raw.from_name ?? ''),
    replyTo: campaign.replyTo ?? String(raw.reply_to ?? ''),
    updatedAt: campaign.updatedAt ?? String(raw.updated_at ?? ''),
    createdAt: campaign.createdAt ?? String(raw.created_at ?? ''),
    stepCount: campaign.stepCount ?? numberValue(raw.step_count),
    enrolledCount: campaign.enrolledCount ?? numberValue(raw.enrollment_count),
    sentCount: campaign.sentCount ?? numberValue(raw.sent_count),
    openedCount: campaign.openedCount ?? numberValue(raw.opened_count),
    clickedCount: campaign.clickedCount ?? numberValue(raw.clicked_count),
    steps: rawSteps.map((step) => {
      const item = (step && typeof step === 'object' ? step : {}) as Record<string, unknown>;
      return {
        ...item,
        id: item.id as string | number | undefined,
        stepOrder: numberValue(item.stepOrder ?? item.step_order),
        delayMinutes: numberValue(item.delayMinutes ?? item.delay_minutes),
        subject: String(item.subject ?? ''),
        previewText: String(item.previewText ?? item.preview_text ?? ''),
        htmlTemplate: String(item.htmlTemplate ?? item.html_template ?? ''),
        textTemplate: String(item.textTemplate ?? item.text_template ?? ''),
        ctaLabel: String(item.ctaLabel ?? item.cta_label ?? ''),
        ctaUrl: String(item.ctaUrl ?? item.cta_url ?? ''),
      };
    }),
  };
};

const getCampaigns = (payload: unknown): Campaign[] => {
  if (Array.isArray(payload)) return payload.map(toCampaign);
  if (!payload || typeof payload !== 'object') return [];
  const envelope = payload as Record<string, unknown>;
  const data = envelope.data && typeof envelope.data === 'object'
    ? envelope.data as Record<string, unknown>
    : undefined;
  const campaigns = envelope.campaigns ?? data?.campaigns ?? envelope.items ?? data?.items;
  return Array.isArray(campaigns) ? campaigns.map(toCampaign) : [];
};

const getTotals = (payload: unknown): Totals => {
  if (!payload || typeof payload !== 'object') return {};
  const envelope = payload as Record<string, unknown>;
  const data = envelope.data && typeof envelope.data === 'object'
    ? envelope.data as Record<string, unknown>
    : undefined;
  return ((envelope.totals ?? data?.totals ?? {}) as Totals);
};

const getDetail = (payload: unknown): DetailResponse => {
  const envelope = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const data = envelope.data && typeof envelope.data === 'object'
    ? envelope.data as Record<string, unknown>
    : envelope;
  const campaignValue = data.campaign ?? envelope.campaign ?? data;
  return {
    campaign: toCampaign(campaignValue),
    stats: (data.stats ?? envelope.stats ?? {}) as CampaignStats,
  };
};

const api = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, { credentials: 'include', ...options });
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
};

const statusStyle: Record<string, string> = {
  active: 'bg-[#e2f6ee] text-[#15704e] border-[#b9e8d2]',
  paused: 'bg-[#fff3dc] text-[#8b5b10] border-[#f2d59e]',
  draft: 'bg-[#eef0f8] text-[#515778] border-[#d8dced]',
  completed: 'bg-[#e8e7fb] text-[#4b49a3] border-[#c8c7f0]',
  archived: 'bg-[#f0f1f4] text-[#697084] border-[#d9dce4]',
};

const displayStatus = (status?: CampaignStatus) => status ? status.replace(/_/g, ' ') : 'draft';

const formatDate = (date?: string) => {
  if (!date) return 'Not updated';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const rate = (value: unknown) => {
  const parsed = numberValue(value);
  return `${parsed <= 1 ? (parsed * 100).toFixed(1) : parsed.toFixed(1)}%`;
};

const stepTitle = (step: CampaignStep, index: number) => step.subject || `Email ${index + 1}`;

const Metric = ({ label, value, detail, icon: Icon, tone = 'indigo' }: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ElementType;
  tone?: 'indigo' | 'mint' | 'amber' | 'ink';
}) => {
  const tones = {
    indigo: 'bg-[#eeeeff] text-[#4d50be]',
    mint: 'bg-[#e5f7f0] text-[#15704e]',
    amber: 'bg-[#fff2d9] text-[#9a6818]',
    ink: 'bg-[#e9ebf6] text-[#333758]',
  };
  return (
    <div className="rounded-xl border border-[#dde0ee] bg-[#fbfbfe] p-4 shadow-[0_2px_8px_rgba(31,35,79,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#737890]">{label}</p>
          <p className="mt-1 font-[var(--font-display)] text-2xl font-bold tracking-tight text-[#202346]">{value}</p>
          <p className="mt-1 text-xs text-[#858ba2]">{detail}</p>
        </div>
        <div className={`rounded-lg p-2 ${tones[tone]}`}><Icon size={17} /></div>
      </div>
    </div>
  );
};

const StatusPill = ({ status }: { status?: CampaignStatus }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusStyle[status || 'draft'] || statusStyle.draft}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {displayStatus(status)}
  </span>
);

const Skeleton = () => (
  <div className="animate-pulse space-y-3 p-5">
    <div className="h-5 w-2/3 rounded bg-[#e2e4ef]" />
    <div className="h-3 w-1/2 rounded bg-[#e9eaf2]" />
    <div className="h-16 rounded-xl bg-[#e9eaf2]" />
    <div className="h-16 rounded-xl bg-[#e9eaf2]" />
  </div>
);

export const PlatformEmailCampaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totals, setTotals] = useState<Totals>({});
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState('all');

  const loadCampaigns = useCallback(async (preferredId?: string | number | null) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api('/api/admin/platform-email-campaigns');
      const nextCampaigns = getCampaigns(payload);
      setCampaigns(nextCampaigns);
      setTotals(getTotals(payload));
      setSelectedId((current) => {
        const target = preferredId ?? current;
        return nextCampaigns.some((campaign) => String(campaign.id) === String(target))
          ? target
          : nextCampaigns[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string | number) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const nextDetail = getDetail(await api(`/api/admin/platform-email-campaigns/${id}`));
      setDetail(nextDetail);
      setDraft({
        name: nextDetail.campaign.name || '',
        description: nextDetail.campaign.description || '',
        category: nextDetail.campaign.category || 'lifecycle',
        triggerEvent: nextDetail.campaign.triggerEvent || 'signup',
        audienceRule: nextDetail.campaign.audienceRule || {},
        fromName: nextDetail.campaign.fromName || '',
        replyTo: nextDetail.campaign.replyTo || '',
        steps: nextDetail.campaign.steps || [],
      });
    } catch (err) {
      setDetail(null);
      setDraft(null);
      setDetailError(err instanceof Error ? err.message : 'Unable to load campaign details.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (selectedId !== null) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const visibleCampaigns = useMemo(() => {
    if (filter === 'all') return campaigns;
    return campaigns.filter((campaign) => (campaign.status || 'draft') === filter);
  }, [campaigns, filter]);

  const selectedCampaign = detail?.campaign || campaigns.find((campaign) => String(campaign.id) === String(selectedId));
  const stats = detail?.stats || {};
  const campaignRecord = selectedCampaign as Record<string, unknown> | undefined;
  const statRecord = stats as Record<string, unknown>;
  const totalCampaigns = totals.campaigns ?? campaigns.length;
  const activeCampaigns = totals.active ?? campaigns.filter((campaign) => campaign.status === 'active').length;
  const totalEnrolled = totals.enrolled ?? campaigns.reduce((sum, campaign) => sum + pickNumber(campaign as Record<string, unknown>, 'enrolled', 'enrolledCount'), 0);
  const totalDelivered = totals.delivered ?? campaigns.reduce((sum, campaign) => sum + pickNumber(campaign as Record<string, unknown>, 'delivered', 'deliveredCount'), 0);

  const runAction = async (actionName: 'launch' | 'pause' | 'activate' | 'process') => {
    if (!selectedCampaign) return;
    const id = selectedCampaign.id;
    if (actionName === 'launch' && !window.confirm('Launch this campaign and enroll eligible owners?')) return;
    setAction(actionName);
    setNotice(null);
    try {
      const endpoint = actionName === 'process'
        ? '/api/admin/platform-email-campaigns/process'
        : `/api/admin/platform-email-campaigns/${id}/${actionName}`;
      const result = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const enrolled = result && typeof result === 'object'
        ? pickNumber(result as Record<string, unknown>, 'enrolled', 'enrolledCount')
        : 0;
      setNotice({
        type: 'success',
        text: actionName === 'launch' && enrolled
          ? `Campaign launched. ${enrolled.toLocaleString()} owners enrolled.`
          : `Campaign ${actionName === 'process' ? 'processed' : `${actionName}d`} successfully.`,
      });
      await loadCampaigns(id);
      await loadDetail(id);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : `Could not ${actionName} campaign.` });
    } finally {
      setAction(null);
    }
  };

  const saveCampaign = async () => {
    if (!selectedCampaign || !draft) return;
    setAction('save');
    setNotice(null);
    try {
      await api(`/api/admin/platform-email-campaigns/${selectedCampaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
          category: draft.category,
          triggerEvent: draft.triggerEvent,
          audienceRule: draft.audienceRule,
          fromName: draft.fromName.trim() || null,
          replyTo: draft.replyTo.trim() || null,
          status: selectedCampaign.status || 'draft',
          steps: draft.steps.map((step, index) => ({
            delayMinutes: Math.max(0, Number(step.delayMinutes) || 0),
            subject: step.subject,
            previewText: step.previewText,
            htmlTemplate: step.htmlTemplate,
            textTemplate: step.textTemplate,
            ctaLabel: step.ctaLabel,
            ctaUrl: step.ctaUrl,
            order: index + 1,
          })),
        }),
      });
      setNotice({ type: 'success', text: 'Campaign changes saved.' });
      await loadCampaigns(selectedCampaign.id);
      await loadDetail(selectedCampaign.id);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Could not save campaign changes.' });
    } finally {
      setAction(null);
    }
  };

  const updateStep = (index: number, key: keyof CampaignStep, value: string | number) => {
    setDraft((current) => current ? {
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, [key]: value } : step),
    } : current);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.steps.length) return current;
      const steps = [...current.steps];
      [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
      return { ...current, steps };
    });
  };

  const removeStep = (index: number) => {
    if (!window.confirm('Remove this email step from the campaign?')) return;
    setDraft((current) => current ? { ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index) } : current);
  };

  const addStep = () => {
    setDraft((current) => current ? {
      ...current,
      steps: [...current.steps, {
        subject: '',
        previewText: '',
        htmlTemplate: '<p>Hi {{firstName}},</p>',
        textTemplate: 'Hi {{firstName}},',
        ctaLabel: 'Open Certxa',
        ctaUrl: '/overview',
        delayMinutes: current.steps.length ? 1440 : 0,
      }],
    } : current);
  };

  return (
    <div className="min-h-full bg-[#f1f2f8] text-[#242744]">
      <header className="border-b border-[#2c3064] bg-[#20234c] px-5 py-5 text-white sm:px-7">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#aeb2e8]">
              <Mail size={14} /> Lifecycle operations
            </div>
            <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">Platform Email Engine</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#c5c8e5]">Guide every owner from first signup to a confident next step.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadCampaigns(selectedId)}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-[#6569ba] bg-[#343878] px-4 text-sm font-semibold text-white transition hover:bg-[#444996] disabled:cursor-wait disabled:opacity-60 lg:self-center"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh data
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
        {notice && (
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${notice.type === 'success' ? 'border-[#b9e8d2] bg-[#eaf9f2] text-[#1e6e51]' : 'border-[#efc3c8] bg-[#fff0f1] text-[#a13742]'}`}>
            {notice.type === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
            <span className="flex-1">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="rounded p-1 hover:bg-black/5" aria-label="Dismiss notification"><XCircle size={16} /></button>
          </div>
        )}

        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#efc3c8] bg-[#fff0f1] px-4 py-3 text-sm text-[#a13742]">
            <AlertCircle size={17} />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => void loadCampaigns(selectedId)} className="rounded-md border border-[#d98b95] px-3 py-1.5 text-xs font-bold hover:bg-[#ffe4e6]">Retry</button>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Campaigns" value={totalCampaigns} detail={`${activeCampaigns} currently active`} icon={Zap} />
          <Metric label="Owners enrolled" value={totalEnrolled.toLocaleString()} detail="Across all lifecycle paths" icon={Users} tone="mint" />
          <Metric label="Delivered" value={totalDelivered.toLocaleString()} detail="Confirmed by provider" icon={Check} tone="amber" />
          <Metric label="Selected delivery" value={rate(statRecord.deliveryRate ?? campaignRecord?.deliveryRate)} detail={selectedCampaign ? selectedCampaign.name || 'Selected campaign' : 'Choose a campaign'} icon={BarChart3} tone="ink" />
        </section>

        <section className="grid min-h-[620px] gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(600px,1.8fr)]">
          <div className="overflow-hidden rounded-xl border border-[#d9dce9] bg-[#fbfbfe] shadow-[0_3px_14px_rgba(31,35,79,0.05)]">
            <div className="border-b border-[#e2e4ef] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-[var(--font-display)] text-lg font-bold text-[#202346]">Campaigns</h2>
                  <p className="mt-0.5 text-xs text-[#858ba2]">Operational sequences and their current state.</p>
                </div>
                <span className="rounded-full bg-[#eeeefe] px-2 py-1 text-[11px] font-bold text-[#5154c9]">{visibleCampaigns.length}</span>
              </div>
              <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
                {['all', 'active', 'paused', 'draft'].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-bold capitalize transition ${filter === value ? 'bg-[#5154c9] text-white' : 'text-[#747b94] hover:bg-[#eef0f8]'}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-[#e7e8f0]">
              {loading && campaigns.length === 0 ? <Skeleton /> : visibleCampaigns.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eeeefe] text-[#5154c9]"><FileText size={21} /></div>
                  <p className="font-semibold text-[#303452]">No campaigns in this view</p>
                  <p className="mt-1 text-xs text-[#858ba2]">Try another status filter or refresh the workspace.</p>
                </div>
              ) : visibleCampaigns.map((campaign) => {
                const selected = String(campaign.id) === String(selectedId);
                const enrolled = pickNumber(campaign as Record<string, unknown>, 'enrolled', 'enrolledCount');
                const steps = campaign.stepCount ?? campaign.totalSteps ?? campaign.steps?.length ?? 0;
                return (
                  <button
                    type="button"
                    key={String(campaign.id)}
                    onClick={() => setSelectedId(campaign.id)}
                    className={`group flex w-full items-start gap-3 px-4 py-4 text-left transition ${selected ? 'bg-[#f0f0ff] shadow-[inset_3px_0_#5154c9]' : 'hover:bg-[#f5f5fa]'}`}
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${selected ? 'bg-[#5154c9] text-white' : 'bg-[#e9ebf6] text-[#626a91]'}`}>
                      {campaign.name?.slice(0, 2).toUpperCase() || 'EM'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-bold text-[#292d50]">{campaign.name || 'Untitled campaign'}</p>
                        <ChevronRight size={15} className={`mt-0.5 shrink-0 text-[#a0a5b9] transition-transform ${selected ? 'translate-x-0.5 text-[#5154c9]' : 'group-hover:translate-x-0.5'}`} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusPill status={campaign.status} />
                        <span className="text-[11px] text-[#858ba2]">{steps} {steps === 1 ? 'step' : 'steps'}</span>
                        <span className="text-[11px] text-[#858ba2]">·</span>
                        <span className="text-[11px] text-[#858ba2]">{enrolled.toLocaleString()} enrolled</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            {detailLoading ? (
              <div className="rounded-xl border border-[#d9dce9] bg-[#fbfbfe]"><Skeleton /></div>
            ) : detailError ? (
              <div className="rounded-xl border border-[#efc3c8] bg-[#fff0f1] p-8 text-center text-[#a13742]">
                <AlertCircle className="mx-auto mb-3" size={24} />
                <p className="font-semibold">{detailError}</p>
                <button type="button" onClick={() => selectedId !== null && void loadDetail(selectedId)} className="mt-4 rounded-md border border-[#d98b95] px-3 py-1.5 text-xs font-bold">Retry detail</button>
              </div>
            ) : !selectedCampaign || !draft ? (
              <div className="flex min-h-[500px] items-center justify-center rounded-xl border border-dashed border-[#cdd1e2] bg-[#f8f8fc] p-8 text-center">
                <div><Mail className="mx-auto mb-3 text-[#9da3bc]" size={28} /><p className="font-semibold text-[#4a4e6b]">Select a campaign to inspect its journey</p></div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-[#d9dce9] bg-[#fbfbfe] p-5 shadow-[0_3px_14px_rgba(31,35,79,0.05)] sm:p-6">
                  <div className="flex flex-col gap-4 border-b border-[#e2e4ef] pb-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><StatusPill status={selectedCampaign.status} /><span className="text-[11px] text-[#858ba2]">Updated {formatDate(selectedCampaign.updatedAt)}</span></div>
                      <h2 className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#202346]">Campaign control</h2>
                      <p className="mt-1 text-sm text-[#858ba2]">Edit the sequence, then use lifecycle controls to move it forward.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedCampaign.status === 'draft' || selectedCampaign.status === 'paused') && (
                        <button type="button" onClick={() => void runAction(selectedCampaign.status === 'draft' ? 'launch' : 'activate')} disabled={!!action} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#5154c9] px-3 text-xs font-bold text-white transition hover:bg-[#4144ad] disabled:cursor-wait disabled:opacity-60">
                          {action === 'launch' || action === 'activate' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                          {selectedCampaign.status === 'draft' ? 'Launch' : 'Activate'}
                        </button>
                      )}
                      {selectedCampaign.status === 'active' && (
                        <button type="button" onClick={() => void runAction('pause')} disabled={!!action} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#e2c481] bg-[#fff7e8] px-3 text-xs font-bold text-[#865b14] transition hover:bg-[#ffefd0] disabled:opacity-60">
                          {action === 'pause' ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />} Pause
                        </button>
                      )}
                      <button type="button" onClick={() => void runAction('process')} disabled={!!action} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#cfd2e4] bg-[#f7f7fb] px-3 text-xs font-bold text-[#4c5278] transition hover:bg-[#eceef8] disabled:opacity-60">
                        {action === 'process' ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />} Process now
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="Enrolled" value={pickNumber(statRecord, 'enrolled', 'enrolledCount').toLocaleString()} detail="Eligible owners" icon={Users} tone="ink" />
                    <Metric label="Delivered" value={pickNumber(statRecord, 'delivered', 'deliveredCount').toLocaleString()} detail="Confirmed sends" icon={Send} tone="mint" />
                    <Metric label="Open rate" value={rate(statRecord.openRate)} detail={`${pickNumber(statRecord, 'opened', 'openedCount').toLocaleString()} opens`} icon={Mail} />
                    <Metric label="Conversion" value={rate(statRecord.conversionRate)} detail={`${pickNumber(statRecord, 'converted', 'convertedCount').toLocaleString()} converted`} icon={Sparkles} tone="amber" />
                  </div>
                </div>

                <div className="rounded-xl border border-[#d9dce9] bg-[#fbfbfe] shadow-[0_3px_14px_rgba(31,35,79,0.05)]">
                  <div className="flex flex-col gap-3 border-b border-[#e2e4ef] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div><h3 className="flex items-center gap-2 font-[var(--font-display)] text-lg font-bold text-[#202346]"><Settings2 size={18} className="text-[#5154c9]" /> Sequence editor</h3><p className="mt-0.5 text-xs text-[#858ba2]">Ordered steps run top to bottom. Changes are saved as one campaign update.</p></div>
                    <button type="button" onClick={saveCampaign} disabled={action === 'save' || !draft.name.trim()} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-[#20234c] px-3 text-xs font-bold text-white transition hover:bg-[#303467] disabled:cursor-not-allowed disabled:opacity-50">
                      {action === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save changes
                    </button>
                  </div>
                  <div className="space-y-5 p-5 sm:p-6">
                     <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#737890]">Campaign name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-10 w-full rounded-md border border-[#d5d8e6] bg-white px-3 text-sm text-[#292d50] outline-none transition focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                      <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#737890]">Description</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="h-10 w-full rounded-md border border-[#d5d8e6] bg-white px-3 text-sm text-[#292d50] outline-none transition focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                       <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#737890]">Trigger event</span><input value={draft.triggerEvent} onChange={(event) => setDraft({ ...draft, triggerEvent: event.target.value })} className="h-10 w-full rounded-md border border-[#d5d8e6] bg-white px-3 text-sm text-[#292d50] outline-none transition focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                    </div>
                    <div className="space-y-3">
                      {draft.steps.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#cdd1e2] bg-[#f8f8fc] px-5 py-10 text-center"><Clock3 className="mx-auto mb-2 text-[#9da3bc]" size={22} /><p className="text-sm font-semibold text-[#4a4e6b]">No email steps yet</p><p className="mt-1 text-xs text-[#858ba2]">Add the first touchpoint to start this journey.</p></div>
                      ) : draft.steps.map((step, index) => (
                        <div key={step.id ?? `step-${index}`} className="rounded-lg border border-[#dfe1ed] bg-[#f8f8fc] p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#5154c9] text-[11px] font-bold text-white">{index + 1}</span><span className="text-xs font-bold uppercase tracking-[0.11em] text-[#555b7d]">Email step</span></div>
                            <div className="flex items-center gap-1">
                              <button type="button" title="Move step up" aria-label="Move step up" onClick={() => moveStep(index, -1)} disabled={index === 0} className="rounded p-1.5 text-[#686f8e] hover:bg-[#e9eafd] disabled:opacity-30"><ArrowUp size={15} /></button>
                              <button type="button" title="Move step down" aria-label="Move step down" onClick={() => moveStep(index, 1)} disabled={index === draft.steps.length - 1} className="rounded p-1.5 text-[#686f8e] hover:bg-[#e9eafd] disabled:opacity-30"><ArrowDown size={15} /></button>
                              <button type="button" title="Remove step" aria-label="Remove step" onClick={() => removeStep(index)} className="rounded p-1.5 text-[#b25b67] hover:bg-[#fde7e9]"><Trash2 size={15} /></button>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#7b8098]">Subject line</span><input value={step.subject || ''} onChange={(event) => updateStep(index, 'subject', event.target.value)} placeholder="A useful next step for your business" className="h-9 w-full rounded-md border border-[#d5d8e6] bg-white px-3 text-sm outline-none focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#7b8098]">Delay (minutes)</span><input type="number" min={0} value={step.delayMinutes ?? 0} onChange={(event) => updateStep(index, 'delayMinutes', Number(event.target.value))} className="h-9 w-full rounded-md border border-[#d5d8e6] bg-white px-3 text-sm outline-none focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                          </div>
                          <label className="mt-3 block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#7b8098]">Preview text</span><input value={step.previewText || ''} onChange={(event) => updateStep(index, 'previewText', event.target.value)} placeholder="What the owner sees before opening" className="h-9 w-full rounded-md border border-[#d5d8e6] bg-white px-3 text-sm outline-none focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                          <label className="mt-3 block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#7b8098]">HTML email body</span><textarea value={step.htmlTemplate || ''} onChange={(event) => updateStep(index, 'htmlTemplate', event.target.value)} rows={5} placeholder="<p>Write the email body with {{firstName}} placeholders</p>" className="w-full resize-y rounded-md border border-[#d5d8e6] bg-white px-3 py-2 text-sm outline-none focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#7b8098]">CTA label</span><input value={step.ctaLabel || ''} onChange={(event) => updateStep(index, 'ctaLabel', event.target.value)} className="h-9 w-full rounded-md border border-[#d5d8e6] bg-white px-3 text-sm outline-none focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#7b8098]">CTA URL</span><input value={step.ctaUrl || ''} onChange={(event) => updateStep(index, 'ctaUrl', event.target.value)} className="h-9 w-full rounded-md border border-[#d5d8e6] bg-white px-3 text-sm outline-none focus:border-[#5154c9] focus:ring-2 focus:ring-[#5154c9]/15" /></label>
                          </div>
                          <p className="mt-2 text-[10px] text-[#9297aa]">Step {index + 1} sends {Number(step.delayMinutes ?? 0) === 0 ? 'immediately' : `${(Number(step.delayMinutes ?? 0) / 1440).toFixed(1)} days after the previous touchpoint`}.</p>
                          <span className="sr-only">{stepTitle(step, index)}</span>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={addStep} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-dashed border-[#9da3d7] px-3 text-xs font-bold text-[#5154c9] transition hover:bg-[#f0f0ff]"><Plus size={15} /> Add email step</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default PlatformEmailCampaigns;