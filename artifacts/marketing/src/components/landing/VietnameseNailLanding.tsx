import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { ArrowRight, Check } from 'lucide-react';

/**
 * "Vietnamese nail salon software" — one landing page in English (/vietnamese-nail-salon-software) and
 * Vietnamese (/vi/phan-mem-tiem-nail), linked as language versions of each other (hreflang).
 *
 * Every claim here is true of the product as built (2026-10-15): the /nail POS switches per tablet between
 * English, Vietnamese and Spanish; the owner and staff apps have a Vietnamese setting; the kiosk lets clients
 * pick English, Spanish, Vietnamese, Chinese or Korean; six turn methods; tip split per technician; cash price;
 * part-check / part-cash payroll and technician pay slips; offline tickets and cash sales. Marketing rules kept:
 * no native-app claims, support is not 24/7, deposits are not claimed, plan prices as on /pricing.
 */

const SITE = 'https://certxa.com';
export const EN_PATH = '/vietnamese-nail-salon-software';
export const VI_PATH = '/vi/phan-mem-tiem-nail';

export type Lang = 'en' | 'vi';

interface Copy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  answer: string;
  ctaStart: string;
  ctaPricing: string;
  otherLangLabel: string;
  featuresHeading: string;
  features: { title: string; body: string }[];
  oneHeading: string;
  oneBody: string;
  oneList: string[];
  priceHeading: string;
  prices: { plan: string; price: string; note: string }[];
  priceNote: string;
  faqHeading: string;
  faq: { q: string; a: string }[];
  finalHeading: string;
  finalBody: string;
  breadcrumbHome: string;
}

const COPY: Record<Lang, Copy> = {
  en: {
    metaTitle: 'Vietnamese Nail Salon Software | Certxa POS, Turns & Tech Payroll',
    metaDescription:
      'Certxa is nail salon software for Vietnamese-owned salons: a POS your technicians can use in Vietnamese, turn rotation, tickets, tips per tech, pay slips, a check-in kiosk and an AI phone receptionist. Free to start; $22 a month for a salon.',
    eyebrow: 'Vietnamese nail salon software',
    h1: 'Nail salon software built for Vietnamese-owned salons',
    answer:
      'Certxa is salon software made for the way Vietnamese-owned nail salons work in the United States. Technicians can use the POS in Vietnamese, the turn list follows the rules your front desk already uses, and check-in, booking, checkout, tips, payroll and an AI phone receptionist are one system, from $22 a month with no setup fee.',
    ctaStart: 'Start free',
    ctaPricing: 'See pricing',
    otherLangLabel: 'Đọc bằng tiếng Việt',
    featuresHeading: 'Built around how a nail salon really runs',
    features: [
      { title: 'Screens in Vietnamese', body: 'Each POS tablet switches between English, Vietnamese and Spanish with one tap, so the front desk and the technicians can each read it their way. The owner dashboard has a Vietnamese setting, and the check-in kiosk lets clients choose English, Spanish, Vietnamese, Chinese or Korean.' },
      { title: 'Turn rotation that matches your salon', body: 'Six turn methods, including dollar-based turns and counted turns with half turns. Walk-ins go to the next technician in line who is clocked in and does the service, and a manager can adjust turns by hand.' },
      { title: 'Tickets, not just appointments', body: 'Every walk-in gets a ticket number. Technicians sign in with their Tech ID, start the service when the client sits down, and a visit can hold two services with one technician when possible.' },
      { title: 'Tips, cash price and gift cards', body: 'Split the tip between technicians on one ticket, offer a cash price, sell and redeem gift cards, and take cards on the Stripe M2 reader without leaving the ticket.' },
      { title: 'Payroll your technicians understand', body: 'Commission on services and products, supply-fee deductions, pay part by check and part in cash, print paychecks, and let each technician print their own daily or weekly pay slip.' },
      { title: 'Keeps working when the internet drops', body: 'Tickets, check-ins and cash sales carry on during an outage and are sent to the server when the connection comes back, so a busy Saturday never stops at the front desk.' },
      { title: 'Autumn answers the phone', body: 'Autumn, the AI receptionist, answers every call, books, moves and cancels appointments, and knows when each technician is working. She answers in English and can carry on in Vietnamese or Spanish when a caller speaks it.' },
      { title: 'Check-in kiosk and customer screen', body: 'Clients check in by phone number on a tablet at the door and pick their services, and a second screen at the desk shows them the total and lets them choose a tip.' },
    ],
    oneHeading: 'One system instead of a stack of subscriptions',
    oneBody:
      'Many nail salons pay for check-in, booking, the POS and card processing as separate monthly subscriptions, each with its own setup fee. Certxa puts them in one plan and one client list.',
    oneList: [
      'Check-in kiosk, online booking, POS and payroll in one login',
      'No setup fee on any plan',
      'One client list for check-in, booking, loyalty and marketing texts',
      'Support every day, 10 am to 9 pm Eastern',
    ],
    priceHeading: 'Simple pricing',
    prices: [
      { plan: 'Solo', price: 'Free', note: 'One technician working on their own' },
      { plan: 'Professional', price: '$22 a month', note: 'Unlimited technicians; $18 a month billed yearly' },
      { plan: 'Elite', price: '$49 a month', note: 'Up to 5 locations; $39 a month billed yearly' },
    ],
    priceNote: 'Card payments and Autumn call allowances are listed on the pricing page.',
    faqHeading: 'Questions salon owners ask',
    faq: [
      { q: 'Is there nail salon software in Vietnamese?', a: 'Yes. Certxa’s nail salon POS can be switched to Vietnamese on each tablet, the owner dashboard has a Vietnamese setting, and the check-in kiosk lets clients pick Vietnamese. Each tablet can use a different language, so technicians and the front desk can each read the screen in their own language.' },
      { q: 'Does Certxa handle turns for nail technicians?', a: 'Yes. Certxa has six turn methods, including dollar-based turns and counted turns with half turns. Walk-ins are given to the next technician in line who is clocked in and does the service, and managers can adjust turns by hand.' },
      { q: 'Can technicians see their own pay?', a: 'Yes. Each technician can print their own pay slip for the day, the week or the pay period from the POS, without the front desk printing slips for everyone. Owners can pay part by check and part in cash and print paychecks.' },
      { q: 'What happens if the internet goes down?', a: 'The salon keeps working. Tickets, check-ins and cash sales are saved on the tablet and sent to the server when the connection comes back. Card payments need the internet.' },
      { q: 'Can the AI receptionist speak Vietnamese?', a: 'Autumn answers in English and can continue the call in Vietnamese or Spanish when the caller speaks it. She books, moves and cancels appointments and knows each technician’s schedule.' },
      { q: 'How much does Certxa cost for a nail salon?', a: 'Certxa is free for one technician working alone. A salon with a team uses the Professional plan at $22 a month ($18 a month billed yearly), with unlimited technicians and no setup fee.' },
      { q: 'What do I need to run it?', a: 'Certxa runs on touchscreen tablets and computers you may already have. It works with the Stripe M2 card reader and with USB, Bluetooth and network receipt printers.' },
    ],
    finalHeading: 'Try Certxa in your salon',
    finalBody: 'Set up your services and technicians in an afternoon. No setup fee, and the Solo plan is free.',
    breadcrumbHome: 'Home',
  },
  vi: {
    metaTitle: 'Phần mềm tiệm nail cho chủ tiệm người Việt | Certxa',
    metaDescription:
      'Certxa là phần mềm tiệm nail cho tiệm của người Việt: máy POS thợ đọc được bằng tiếng Việt, xếp lượt (turn), phiếu, chia tip cho từng thợ, phiếu lương, máy check-in và lễ tân AI nghe điện thoại. Bắt đầu miễn phí; $22 một tháng cho tiệm.',
    eyebrow: 'Phần mềm tiệm nail',
    h1: 'Phần mềm tiệm nail dành cho tiệm của người Việt',
    answer:
      'Certxa là phần mềm làm theo đúng cách các tiệm nail của người Việt ở Mỹ đang làm việc. Thợ có thể dùng máy POS bằng tiếng Việt, danh sách lượt theo đúng quy tắc tiệm bạn đang dùng, và check-in, đặt hẹn, tính tiền, tip, lương thợ cùng lễ tân AI nghe điện thoại đều nằm trong một hệ thống, từ $22 một tháng, không tốn phí cài đặt.',
    ctaStart: 'Dùng thử miễn phí',
    ctaPricing: 'Xem giá',
    otherLangLabel: 'Read in English',
    featuresHeading: 'Làm theo đúng cách tiệm nail chạy mỗi ngày',
    features: [
      { title: 'Màn hình bằng tiếng Việt', body: 'Mỗi máy POS chuyển giữa tiếng Anh, tiếng Việt và tiếng Tây Ban Nha chỉ với một chạm, nên người ở quầy và thợ đều đọc được theo cách của mình. Trang quản lý của chủ tiệm có chế độ tiếng Việt, và máy check-in cho khách chọn tiếng Anh, Tây Ban Nha, Việt, Trung hoặc Hàn.' },
      { title: 'Xếp lượt đúng như tiệm bạn', body: 'Sáu cách tính lượt, kể cả tính lượt theo số tiền và đếm lượt có nửa lượt. Khách walk-in được giao cho thợ kế tiếp đã vào ca và làm được dịch vụ đó, và quản lý có thể chỉnh lượt bằng tay.' },
      { title: 'Phiếu cho từng khách', body: 'Mỗi khách walk-in có số phiếu. Thợ đăng nhập bằng mã thợ, bấm bắt đầu khi khách ngồi vào ghế, và một lần ghé có thể có hai dịch vụ với cùng một thợ khi được.' },
      { title: 'Tip, giá tiền mặt và thẻ quà', body: 'Chia tip cho nhiều thợ trên một phiếu, có giá riêng khi trả tiền mặt, bán và dùng thẻ quà, và quẹt thẻ bằng máy Stripe M2 ngay trên phiếu.' },
      { title: 'Lương thợ rõ ràng', body: 'Tính hoa hồng cho dịch vụ và sản phẩm, trừ phí vật liệu, trả một phần bằng check và một phần tiền mặt, in check lương, và mỗi thợ tự in phiếu lương theo ngày hoặc theo tuần.' },
      { title: 'Vẫn chạy khi mất mạng', body: 'Phiếu, check-in và tiền mặt vẫn làm được khi mất internet, và được gửi lên khi có mạng lại, nên ngày thứ Bảy đông khách quầy vẫn không bị dừng.' },
      { title: 'Autumn nghe điện thoại', body: 'Autumn, lễ tân AI, trả lời mọi cuộc gọi, đặt, dời và hủy hẹn, và biết khi nào từng thợ đi làm. Cô ấy trả lời bằng tiếng Anh và có thể nói tiếp bằng tiếng Việt hoặc tiếng Tây Ban Nha khi khách gọi nói tiếng đó.' },
      { title: 'Máy check-in và màn hình cho khách', body: 'Khách check-in bằng số điện thoại trên máy tính bảng ở cửa và chọn dịch vụ, và màn hình thứ hai ở quầy cho khách xem tổng tiền và chọn tip.' },
    ],
    oneHeading: 'Một hệ thống thay vì nhiều gói trả tháng',
    oneBody:
      'Nhiều tiệm nail đang trả riêng cho check-in, đặt hẹn, máy POS và xử lý thẻ, mỗi thứ một gói hàng tháng và một phí cài đặt. Certxa gom tất cả vào một gói và một danh sách khách.',
    oneList: [
      'Check-in, đặt hẹn online, POS và lương thợ trong một tài khoản',
      'Không có phí cài đặt ở bất kỳ gói nào',
      'Một danh sách khách cho check-in, đặt hẹn, tích điểm và tin nhắn',
      'Hỗ trợ mỗi ngày, 10 giờ sáng đến 9 giờ tối giờ miền Đông',
    ],
    priceHeading: 'Giá đơn giản',
    prices: [
      { plan: 'Solo', price: 'Miễn phí', note: 'Một thợ làm riêng' },
      { plan: 'Professional', price: '$22 một tháng', note: 'Không giới hạn số thợ; $18 một tháng nếu trả theo năm' },
      { plan: 'Elite', price: '$49 một tháng', note: 'Tối đa 5 tiệm; $39 một tháng nếu trả theo năm' },
    ],
    priceNote: 'Phí thẻ và số cuộc gọi Autumn có sẵn được ghi trên trang giá.',
    faqHeading: 'Câu hỏi chủ tiệm hay hỏi',
    faq: [
      { q: 'Có phần mềm tiệm nail bằng tiếng Việt không?', a: 'Có. Máy POS tiệm nail của Certxa chuyển được sang tiếng Việt trên từng máy, trang quản lý có chế độ tiếng Việt, và máy check-in cho khách chọn tiếng Việt. Mỗi máy có thể dùng một ngôn ngữ khác nhau, nên thợ và người ở quầy đều đọc được bằng tiếng của mình.' },
      { q: 'Certxa có xếp lượt cho thợ nail không?', a: 'Có. Certxa có sáu cách tính lượt, kể cả tính theo số tiền và đếm lượt có nửa lượt. Khách walk-in được giao cho thợ kế tiếp đã vào ca và làm được dịch vụ, và quản lý có thể chỉnh lượt bằng tay.' },
      { q: 'Thợ có tự xem lương của mình được không?', a: 'Được. Mỗi thợ tự in phiếu lương theo ngày, theo tuần hoặc theo kỳ lương ngay trên máy POS, không cần quầy in cho từng người. Chủ tiệm có thể trả một phần bằng check, một phần tiền mặt và in check lương.' },
      { q: 'Mất internet thì sao?', a: 'Tiệm vẫn làm việc bình thường. Phiếu, check-in và tiền mặt được lưu trên máy và gửi lên khi có mạng lại. Quẹt thẻ thì cần có internet.' },
      { q: 'Lễ tân AI có nói tiếng Việt không?', a: 'Autumn trả lời bằng tiếng Anh và có thể nói tiếp bằng tiếng Việt hoặc tiếng Tây Ban Nha khi khách gọi nói tiếng đó. Cô ấy đặt, dời và hủy hẹn và biết lịch làm của từng thợ.' },
      { q: 'Certxa giá bao nhiêu cho tiệm nail?', a: 'Certxa miễn phí cho một thợ làm riêng. Tiệm có nhiều thợ dùng gói Professional giá $22 một tháng ($18 một tháng nếu trả theo năm), không giới hạn số thợ và không có phí cài đặt.' },
      { q: 'Cần những gì để dùng?', a: 'Certxa chạy trên máy tính bảng cảm ứng và máy tính bạn có thể đã có sẵn. Dùng được với máy quẹt thẻ Stripe M2 và máy in hóa đơn USB, Bluetooth hoặc qua mạng.' },
    ],
    finalHeading: 'Dùng thử Certxa ở tiệm bạn',
    finalBody: 'Nhập dịch vụ và thợ trong một buổi chiều. Không có phí cài đặt, và gói Solo miễn phí.',
    breadcrumbHome: 'Trang chủ',
  },
};

export default function VietnameseNailLanding({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const path = lang === 'en' ? EN_PATH : VI_PATH;
  const pageUrl = `${SITE}${path}`;
  const otherPath = lang === 'en' ? VI_PATH : EN_PATH;
  const ogImage = `${SITE}/og-image.png`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        name: c.metaTitle,
        url: pageUrl,
        inLanguage: lang,
        description: c.metaDescription,
        isPartOf: { '@id': `${SITE}/#website` },
        about: { '@id': `${SITE}/#software` },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: c.breadcrumbHome, item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: c.eyebrow, item: pageUrl },
          ],
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}#faq`,
        inLanguage: lang,
        mainEntity: c.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  };

  return (
    <>
      <Helmet>
        <html lang={lang} />
        <title>{c.metaTitle}</title>
        <meta name="description" content={c.metaDescription} />
        <link rel="canonical" href={pageUrl} />
        <link rel="alternate" hrefLang="en" href={`${SITE}${EN_PATH}`} />
        <link rel="alternate" hrefLang="vi" href={`${SITE}${VI_PATH}`} />
        <link rel="alternate" hrefLang="x-default" href={`${SITE}${EN_PATH}`} />
        <meta property="og:title" content={c.metaTitle} />
        <meta property="og:description" content={c.metaDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content={lang === 'en' ? 'en_US' : 'vi_VN'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={c.metaTitle} />
        <meta name="twitter:description" content={c.metaDescription} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16" lang={lang}>
        {/* ── Hero: the answer first ── */}
        <section className="bg-background border-b border-border">
          <div className="max-w-5xl mx-auto px-6 md:px-10 py-20 flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-primary tracking-widest uppercase">{c.eyebrow}</span>
              <Link to={otherPath} hrefLang={lang === 'en' ? 'vi' : 'en'} className="text-sm font-semibold text-primary underline underline-offset-4">
                {c.otherLangLabel}
              </Link>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-foreground leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              {c.h1}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">{c.answer}</p>
            <div className="flex flex-wrap gap-3">
              <Link to="/auth?mode=register" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity duration-200">
                {c.ctaStart} <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors duration-200">
                {c.ctaPricing}
              </Link>
            </div>
          </div>
        </section>

        {/* ── What it does ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10 flex flex-col gap-10">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{c.featuresHeading}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {c.features.map((f) => (
                <div key={f.title} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                  <h3 className="font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── One system ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-5xl mx-auto px-6 md:px-10 grid md:grid-cols-2 gap-10 items-start">
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{c.oneHeading}</h2>
              <p className="text-muted-foreground leading-relaxed">{c.oneBody}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {c.oneList.map((item) => (
                <li key={item} className="flex items-start gap-3 text-foreground">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-primary" aria-hidden="true" />
                  </span>
                  <span className="text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-5xl mx-auto px-6 md:px-10 flex flex-col gap-8">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{c.priceHeading}</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {c.prices.map((p) => (
                <div key={p.plan} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-primary tracking-widest uppercase">{p.plan}</span>
                  <span className="text-2xl font-extrabold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.note}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {c.priceNote}{' '}
              <Link to="/pricing" className="text-primary font-semibold underline underline-offset-4">{c.ctaPricing}</Link>
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-6 md:px-10 flex flex-col gap-6">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{c.faqHeading}</h2>
            {c.faq.map((f) => (
              <div key={f.q} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                <h3 className="font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{f.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final call to action ── */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="rounded-3xl bg-primary p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex flex-col gap-3 max-w-xl">
                <h2 className="text-3xl font-extrabold text-primary-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{c.finalHeading}</h2>
                <p className="text-primary-foreground/80">{c.finalBody}</p>
              </div>
              <Link to="/auth?mode=register" className="inline-flex items-center gap-2 px-7 py-4 rounded-lg bg-primary-foreground text-primary font-semibold text-sm hover:opacity-90 transition-opacity duration-200">
                {c.ctaStart} <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
