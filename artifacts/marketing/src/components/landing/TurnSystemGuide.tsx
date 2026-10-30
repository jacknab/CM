import { useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router';
import { ArrowRight, Plus, X } from 'lucide-react';

/**
 * "Nail salon turn system" — a full guide to how turns work, with a free turn calculator, in English
 * (/nail-salon-turn-system) and Vietnamese (/vi/chia-tua-tiem-nail), linked as language versions (hreflang).
 * Owner, 2026-10-30: the page meant to get Certxa found on Google for a phrase nobody answers well today.
 *
 * The methods and the calculator follow Certxa's own turn rules (shared/turnRules.ts): Counted Turns
 * (1 at or over the amount, 1/2 under), Dollar-Based Turns (1/2 under; at or over, one per full amount plus
 * 1/2 for any remainder), Proportional, Equal clients, Fixed order, Dollar brackets. Product facts kept true:
 * walk-ins only earn turns, only the service amount counts, a requested technician keeps their place,
 * turns start again at Day Close, manual changes ask for a reason and are kept in a history.
 */

const SITE = 'https://certxa.com';
export const EN_PATH = '/nail-salon-turn-system';
export const VI_PATH = '/vi/chia-tua-tiem-nail';

export type Lang = 'en' | 'vi';
type CalcMode = 'classic' | 'dollar' | 'proportional' | 'client_count';

interface Copy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  answer: string;
  otherLangLabel: string;
  tocHeading: string;
  methodsHeading: string;
  methodsIntro: string;
  methodsCols: [string, string, string];
  methods: { name: string; how: string; suits: string }[];
  exampleHeading: string;
  exampleIntro: string;
  exampleCols: [string, string, string, string];
  calcHeading: string;
  calcIntro: string;
  calcMethod: string;
  calcModes: Record<CalcMode, string>;
  calcPerTurn: string;
  calcTech: string;
  calcTickets: string;
  calcTicketsHint: string;
  calcAddTech: string;
  calcRemove: string;
  calcColTurns: string;
  calcColPlace: string;
  calcNext: (name: string) => string;
  calcTieNote: string;
  rulesHeading: string;
  rules: { title: string; body: string }[];
  fightsHeading: string;
  fights: string[];
  certxaHeading: string;
  certxaBody: string;
  certxaList: string[];
  ctaStart: string;
  ctaPricing: string;
  readMore: string;
  readMoreLink: { label: string; href: string };
  faqHeading: string;
  faq: { q: string; a: string }[];
  finalHeading: string;
  finalBody: string;
  breadcrumbHome: string;
  sampleNames: [string, string, string];
}

const COPY: Record<Lang, Copy> = {
  en: {
    metaTitle: 'Nail Salon Turn System: How Turns Work + Free Turn Calculator',
    metaDescription:
      'How the nail salon turn system works: full and half turns, dollar-based turns, fixed order, requested techs and resets. Try the free turn calculator.',
    eyebrow: 'Nail salon turn system',
    h1: 'Nail salon turn system: how turns work, with a free turn calculator',
    answer:
      'A turn system is how a nail salon decides which technician gets the next walk-in client. Every technician in the line has a count of turns for the day, and the technician with the fewest turns who can do the service is next. Salons differ in what earns a turn: some count every client, some give a full turn for a big ticket and a half turn for a small one, and some count the dollars of service. Below are the six common methods, worked examples, the rules that prevent arguments, and a calculator you can use with your own tickets.',
    otherLangLabel: 'Đọc bằng tiếng Việt',
    tocHeading: 'On this page',
    methodsHeading: 'The six ways salons count turns',
    methodsIntro:
      'Every method answers the same question, who is next, in the same way: the technician with the lowest score goes next. The methods differ only in what the score is.',
    methodsCols: ['Method', 'How a turn is earned', 'Suits'],
    methods: [
      { name: 'Fixed order (round robin)', how: 'Technicians take walk-ins one after another in a set order. The price of the ticket never matters.', suits: 'Salons where most services cost about the same.' },
      { name: 'Equal clients', how: 'Every finished ticket counts as one client. The technician with the fewest clients is next.', suits: 'Small teams that want the simplest rule.' },
      { name: 'Counted turns (full and half turns)', how: 'A ticket at or over a set amount (for example $30) is one full turn. A smaller ticket is a half turn.', suits: 'The classic turn list most nail salons already use.' },
      { name: 'Dollar-based turns', how: 'One turn for every full amount of service, plus a half turn for anything left over. With $30 a turn, a $65 ticket is 2½ turns.', suits: 'Salons with a wide price range, from polish change to full set with design.' },
      { name: 'Dollar brackets', how: 'The salon lists price bands and what each earns, for example under $30 = ½, from $30 = 1, from $60 = 2.', suits: 'Owners who want big tickets to count more, in fixed steps.' },
      { name: 'Proportional', how: 'Every dollar earns its share of a turn. With $30 a turn, a $45 ticket is 1½ turns and a $40 ticket is 1⅓.', suits: 'Salons that want turns to match sales exactly.' },
    ],
    exampleHeading: 'Worked example: the same tickets, three methods',
    exampleIntro: 'With $30 as the amount for one turn, here is what each ticket earns. Only the service amount counts; tips and retail never do.',
    exampleCols: ['Ticket (services)', 'Counted turns', 'Dollar-based turns', 'Proportional'],
    calcHeading: 'Free nail salon turn calculator',
    calcIntro:
      'Pick a method, set the amount for one turn, and type each technician’s tickets for the day (service amounts only). The calculator adds up the turns and shows who gets the next walk-in.',
    calcMethod: 'Turn method',
    calcModes: { classic: 'Counted turns (full / half)', dollar: 'Dollar-based turns', proportional: 'Proportional', client_count: 'Equal clients' },
    calcPerTurn: 'Dollars for one turn',
    calcTech: 'Technician',
    calcTickets: 'Tickets today ($)',
    calcTicketsHint: 'e.g. 45, 25, 60',
    calcAddTech: 'Add technician',
    calcRemove: 'Remove',
    calcColTurns: 'Turns',
    calcColPlace: 'Place in line',
    calcNext: (name) => `Next walk-in goes to ${name}.`,
    calcTieNote: 'When two technicians have the same number of turns, the one who has waited longest goes first. In this calculator that is the one listed first.',
    rulesHeading: 'The rules every turn list needs',
    rules: [
      { title: 'Requested technicians', body: 'When a client asks for a technician by name, that technician takes the client but keeps their place in the line, so a regular’s loyalty never costs a coworker a walk-in.' },
      { title: 'Walk-ins or appointments', body: 'Decide whether booked clients earn turns. Many salons count walk-ins only, because an appointment was already that technician’s client.' },
      { title: 'What amount counts', body: 'Count the service amount only. Tips, retail products and tax should never earn turns, or the line rewards upselling polish instead of sharing clients.' },
      { title: 'Ties', body: 'When two technicians are level, the one who has waited longest goes first. Writing this down ends most front-desk arguments.' },
      { title: 'Late arrivals', body: 'A technician who clocks in late either starts at zero (and gets the next few clients) or starts level with the lowest in the line. Pick one and post it.' },
      { title: 'When turns start again', body: 'Turns usually reset every business day, at closing. A salon open late can reset at its Day Close instead of midnight.' },
      { title: 'Unpaid and refunded tickets', body: 'A ticket that was never paid should earn nothing. Decide in advance whether a refund takes its turns back.' },
      { title: 'Changing the line by hand', body: 'Managers will sometimes need to move someone. Ask for a reason and keep a record, so the change can be explained later.' },
    ],
    fightsHeading: 'Why turn lists cause arguments, and how to stop them',
    fights: [
      'The rules live in one person’s head. Write them down: the method, the amount for one turn, ties, requests and resets.',
      'The line is on paper. A screen everyone can see, updated the moment a ticket is paid, removes the question “whose turn is it?”.',
      'Big and small tickets count the same. If a $25 polish change and a $90 full set both earn one turn, technicians avoid small services. Half turns or dollar-based turns fix this.',
      'Changes are invisible. When a manager skips someone, the reason should be recorded where the team can see it.',
    ],
    certxaHeading: 'Run your turn list on Certxa',
    certxaBody:
      'Certxa is nail salon software with the turn list built into the POS. You choose one of the six methods above and the line updates itself every time a ticket is paid.',
    certxaList: [
      'All six methods, with your own amount for one turn and your own half-turn rule',
      'Walk-ins go to the next technician who is clocked in, free and does that service',
      'Requested technicians keep their place; only walk-ins earn turns',
      'Only the service amount counts: tips, retail and tax never earn turns',
      'Manual changes ask for a reason, and every assignment is kept in a turn history',
      'Turns start again at Day Close, and the line keeps working on the POS tablets if the internet drops',
      'The POS works in English, Vietnamese and Spanish',
    ],
    ctaStart: 'Start free',
    ctaPricing: 'See pricing',
    readMore: 'Also read:',
    readMoreLink: { label: 'Nail salon software for Vietnamese-owned salons', href: '/vietnamese-nail-salon-software' },
    faqHeading: 'Turn system questions',
    faq: [
      { q: 'What is a turn in a nail salon?', a: 'A turn is one place in the rotation that decides which technician gets the next walk-in client. Each time a technician finishes a client, they earn a turn (or part of one), and the technician with the fewest turns who can do the service is next.' },
      { q: 'What is a half turn?', a: 'A half turn is what a small ticket earns in a counted-turn system. If one turn is $30 of service, a $20 polish change earns half a turn, so the technician who took it stays near the front of the line.' },
      { q: 'How many dollars is one turn?', a: 'Each salon sets its own amount, usually close to the price of its most common service. Certxa starts new salons at $30 a turn, and the owner can change it at any time.' },
      { q: 'Do tips count toward turns?', a: 'They should not. Turns are about sharing clients fairly, so only the service amount should count. In Certxa, tips, retail products and tax never earn turns.' },
      { q: 'Do appointments count as turns?', a: 'That is the salon’s choice. Many salons count walk-ins only, because a booked client already belongs to the technician they booked. In Certxa only walk-ins earn turns.' },
      { q: 'What happens when a client asks for a specific technician?', a: 'The requested technician takes the client but keeps their place in the line. The next walk-in still goes to whoever is next.' },
      { q: 'When do turns reset?', a: 'Usually once a day, at closing. In Certxa turns start again at the salon’s Day Close.' },
      { q: 'Which turn method is the fairest?', a: 'It depends on your menu. If services cost about the same, fixed order or equal clients is fair and simple. If prices range widely, dollar-based turns or half turns stop small tickets from costing a technician a full turn.' },
    ],
    finalHeading: 'Put your turn list on a screen everyone trusts',
    finalBody: 'Set your turn rules once and let the line run itself. Free to start; salon plans from $29 a month with no setup fee.',
    breadcrumbHome: 'Home',
    sampleNames: ['Amy', 'Jenny', 'Maria'],
  },
  vi: {
    metaTitle: 'Chia tua tiệm nail: cách tính lượt cho thợ + máy tính lượt miễn phí',
    metaDescription:
      'Cách chia tua trong tiệm nail: tua đủ và nửa tua, tính tua theo tiền, xoay vòng, khách gọi thợ, reset cuối ngày. Kèm máy tính tua miễn phí.',
    eyebrow: 'Chia tua tiệm nail',
    h1: 'Chia tua tiệm nail: cách tính lượt cho thợ, kèm máy tính tua miễn phí',
    answer:
      'Chia tua là cách tiệm nail quyết định thợ nào nhận khách walk-in kế tiếp. Mỗi thợ trong danh sách có số tua trong ngày, và thợ có ít tua nhất mà làm được dịch vụ đó sẽ được khách kế tiếp. Mỗi tiệm tính tua một kiểu: có tiệm tính mỗi khách là một tua, có tiệm cho tua đủ với phiếu lớn và nửa tua với phiếu nhỏ, có tiệm tính theo số tiền dịch vụ. Dưới đây là sáu cách tính tua thường gặp, ví dụ cụ thể, các luật giúp tránh cãi nhau, và máy tính tua để bạn thử với phiếu của tiệm mình.',
    otherLangLabel: 'Read in English',
    tocHeading: 'Nội dung',
    methodsHeading: 'Sáu cách tính tua trong tiệm nail',
    methodsIntro:
      'Cách nào cũng trả lời cùng một câu hỏi, ai là người kế tiếp, theo cùng một cách: thợ có điểm thấp nhất được khách kế tiếp. Các cách chỉ khác nhau ở chỗ điểm được tính thế nào.',
    methodsCols: ['Cách tính', 'Tua được tính thế nào', 'Hợp với'],
    methods: [
      { name: 'Xoay vòng theo thứ tự', how: 'Thợ nhận khách lần lượt theo thứ tự cố định. Giá phiếu không ảnh hưởng.', suits: 'Tiệm có giá dịch vụ gần giống nhau.' },
      { name: 'Chia đều số khách', how: 'Mỗi phiếu xong là một khách. Thợ có ít khách nhất được khách kế tiếp.', suits: 'Tiệm nhỏ muốn luật đơn giản nhất.' },
      { name: 'Tua đủ và nửa tua', how: 'Phiếu từ một số tiền nhất định trở lên (ví dụ $30) là một tua đủ. Phiếu nhỏ hơn là nửa tua.', suits: 'Cách chia tua quen thuộc của đa số tiệm nail.' },
      { name: 'Tính tua theo tiền', how: 'Mỗi lần đủ số tiền là một tua, phần dư thêm nửa tua. Với $30 một tua, phiếu $65 là 2 tua rưỡi.', suits: 'Tiệm có giá từ đổi màu sơn đến bộ bột vẽ.' },
      { name: 'Theo mức giá', how: 'Tiệm đặt các mức giá và số tua mỗi mức, ví dụ dưới $30 = nửa tua, từ $30 = 1, từ $60 = 2.', suits: 'Chủ tiệm muốn phiếu lớn được tính nhiều hơn theo từng bậc.' },
      { name: 'Theo tỉ lệ', how: 'Mỗi đô la được tính một phần của tua. Với $30 một tua, phiếu $45 là 1 tua rưỡi, phiếu $40 là 1⅓ tua.', suits: 'Tiệm muốn tua khớp đúng với doanh thu.' },
    ],
    exampleHeading: 'Ví dụ: cùng các phiếu, ba cách tính',
    exampleIntro: 'Với $30 cho một tua, đây là số tua mỗi phiếu được tính. Chỉ tính tiền dịch vụ; tiền tip và hàng bán lẻ không bao giờ được tính.',
    exampleCols: ['Phiếu (dịch vụ)', 'Tua đủ / nửa tua', 'Tính theo tiền', 'Theo tỉ lệ'],
    calcHeading: 'Máy tính chia tua miễn phí',
    calcIntro:
      'Chọn cách tính, đặt số tiền cho một tua, rồi nhập các phiếu trong ngày của từng thợ (chỉ tiền dịch vụ). Máy tính sẽ cộng tua và cho biết ai nhận khách walk-in kế tiếp.',
    calcMethod: 'Cách tính tua',
    calcModes: { classic: 'Tua đủ / nửa tua', dollar: 'Tính tua theo tiền', proportional: 'Theo tỉ lệ', client_count: 'Chia đều số khách' },
    calcPerTurn: 'Số tiền cho một tua ($)',
    calcTech: 'Thợ',
    calcTickets: 'Phiếu hôm nay ($)',
    calcTicketsHint: 'ví dụ 45, 25, 60',
    calcAddTech: 'Thêm thợ',
    calcRemove: 'Xóa',
    calcColTurns: 'Số tua',
    calcColPlace: 'Thứ tự',
    calcNext: (name) => `Khách walk-in kế tiếp: ${name}.`,
    calcTieNote: 'Khi hai thợ bằng tua, người chờ lâu hơn được trước. Trong máy tính này là người đứng trên trong danh sách.',
    rulesHeading: 'Những luật tiệm nào cũng cần',
    rules: [
      { title: 'Khách gọi thợ', body: 'Khi khách gọi tên một thợ, thợ đó nhận khách nhưng vẫn giữ chỗ trong danh sách tua, để khách quen của người này không làm người khác mất khách walk-in.' },
      { title: 'Khách walk-in hay khách hẹn', body: 'Quyết định khách hẹn trước có tính tua hay không. Nhiều tiệm chỉ tính khách walk-in, vì khách hẹn vốn đã là khách của thợ đó.' },
      { title: 'Tính tiền nào', body: 'Chỉ tính tiền dịch vụ. Tiền tip, hàng bán lẻ và thuế không nên được tính tua.' },
      { title: 'Bằng tua', body: 'Khi hai thợ bằng tua, người chờ lâu hơn được trước. Ghi rõ luật này sẽ hết phần lớn chuyện cãi nhau ở quầy.' },
      { title: 'Thợ vào trễ', body: 'Thợ vào ca trễ có thể bắt đầu từ 0 (và nhận vài khách kế tiếp) hoặc bắt đầu bằng người thấp nhất. Chọn một cách và dán lên cho mọi người thấy.' },
      { title: 'Khi nào tính lại từ đầu', body: 'Tua thường được tính lại mỗi ngày làm việc, lúc đóng cửa. Tiệm mở khuya có thể tính lại lúc đóng sổ cuối ngày thay vì nửa đêm.' },
      { title: 'Phiếu chưa trả tiền hoặc hoàn tiền', body: 'Phiếu chưa trả tiền không nên được tính tua. Quyết định trước: hoàn tiền thì có trừ tua lại hay không.' },
      { title: 'Đổi thứ tự bằng tay', body: 'Đôi khi quản lý cần đổi thứ tự. Hãy yêu cầu ghi lý do và lưu lại, để sau này giải thích được.' },
    ],
    fightsHeading: 'Vì sao chia tua hay gây cãi nhau, và cách tránh',
    fights: [
      'Luật chỉ nằm trong đầu một người. Hãy viết ra: cách tính, số tiền cho một tua, khi bằng tua, khách gọi thợ và lúc tính lại.',
      'Danh sách tua viết trên giấy. Một màn hình ai cũng thấy, cập nhật ngay khi phiếu được trả tiền, sẽ hết câu hỏi “tới tua ai?”.',
      'Phiếu lớn và phiếu nhỏ tính như nhau. Nếu đổi màu sơn $25 và bộ bột $90 đều là một tua, thợ sẽ né dịch vụ nhỏ. Nửa tua hoặc tính tua theo tiền giải quyết chuyện này.',
      'Thay đổi không ai thấy. Khi quản lý bỏ qua một thợ, lý do nên được ghi lại cho cả tiệm xem.',
    ],
    certxaHeading: 'Chia tua bằng Certxa',
    certxaBody:
      'Certxa là phần mềm tiệm nail có sẵn danh sách tua trong máy POS. Bạn chọn một trong sáu cách tính ở trên và danh sách tự cập nhật mỗi khi phiếu được trả tiền.',
    certxaList: [
      'Đủ sáu cách tính, với số tiền một tua và luật nửa tua của riêng tiệm',
      'Khách walk-in được giao cho thợ kế tiếp đang trong ca, đang rảnh và làm được dịch vụ đó',
      'Khách gọi thợ: thợ vẫn giữ chỗ; chỉ khách walk-in được tính tua',
      'Chỉ tính tiền dịch vụ: tip, hàng bán lẻ và thuế không được tính tua',
      'Đổi thứ tự bằng tay phải ghi lý do, và mọi lần giao khách đều được lưu lại',
      'Tua được tính lại khi đóng sổ cuối ngày, và vẫn chạy trên máy POS khi mất mạng',
      'Máy POS dùng được tiếng Anh, tiếng Việt và tiếng Tây Ban Nha',
    ],
    ctaStart: 'Dùng thử miễn phí',
    ctaPricing: 'Xem bảng giá',
    readMore: 'Xem thêm:',
    readMoreLink: { label: 'Phần mềm tiệm nail cho chủ tiệm người Việt', href: '/vi/phan-mem-tiem-nail' },
    faqHeading: 'Câu hỏi về chia tua',
    faq: [
      { q: 'Tua trong tiệm nail là gì?', a: 'Tua là một lượt trong vòng xoay quyết định thợ nào nhận khách walk-in kế tiếp. Mỗi lần thợ làm xong một khách, thợ được tính một tua (hoặc một phần tua), và thợ có ít tua nhất mà làm được dịch vụ đó sẽ là người kế tiếp.' },
      { q: 'Nửa tua là gì?', a: 'Nửa tua là số tua một phiếu nhỏ được tính. Nếu một tua là $30 tiền dịch vụ, phiếu đổi màu sơn $20 được nửa tua, nên thợ làm phiếu đó vẫn đứng gần đầu danh sách.' },
      { q: 'Một tua là bao nhiêu tiền?', a: 'Mỗi tiệm tự đặt, thường gần bằng giá dịch vụ phổ biến nhất của tiệm. Certxa đặt sẵn $30 một tua cho tiệm mới, và chủ tiệm đổi được bất cứ lúc nào.' },
      { q: 'Tiền tip có được tính tua không?', a: 'Không nên. Chia tua là để chia khách cho công bằng, nên chỉ tính tiền dịch vụ. Trong Certxa, tip, hàng bán lẻ và thuế không bao giờ được tính tua.' },
      { q: 'Khách hẹn trước có được tính tua không?', a: 'Tùy tiệm. Nhiều tiệm chỉ tính khách walk-in, vì khách hẹn vốn là khách của thợ được hẹn. Trong Certxa chỉ khách walk-in được tính tua.' },
      { q: 'Khách gọi tên thợ thì sao?', a: 'Thợ được gọi nhận khách nhưng vẫn giữ chỗ trong danh sách. Khách walk-in kế tiếp vẫn được giao cho người kế tiếp.' },
      { q: 'Khi nào tua được tính lại?', a: 'Thường mỗi ngày một lần, lúc đóng cửa. Trong Certxa tua được tính lại khi tiệm đóng sổ cuối ngày.' },
      { q: 'Cách chia tua nào công bằng nhất?', a: 'Tùy bảng giá của tiệm. Nếu giá dịch vụ gần giống nhau, xoay vòng hoặc chia đều số khách là công bằng và đơn giản. Nếu giá chênh lệch nhiều, tính tua theo tiền hoặc nửa tua giúp phiếu nhỏ không làm thợ mất trọn một tua.' },
    ],
    finalHeading: 'Đưa danh sách tua lên màn hình ai cũng tin',
    finalBody: 'Đặt luật chia tua một lần, danh sách tự chạy. Bắt đầu miễn phí; gói cho tiệm từ $29 một tháng, không phí cài đặt.',
    breadcrumbHome: 'Trang chủ',
    sampleNames: ['Amy', 'Jenny', 'Maria'],
  },
};

// ── Turn math (the same rules as Certxa's turn engine, shared/turnRules.ts) ──

/** Turns a ticket earns, in sixths so ½ and ⅓ stay exact; returned as a number of turns. */
function turnsFor(amount: number, mode: CalcMode, perTurn: number): number {
  if (!(amount > 0)) return 0;
  const t = perTurn > 0 ? perTurn : 30;
  switch (mode) {
    case 'client_count':
      return 1;
    case 'classic':
      return amount >= t ? 1 : 0.5;
    case 'proportional':
      return amount / t;
    case 'dollar': {
      if (amount < t) return 0.5;
      const whole = Math.floor(amount / t + 1e-9);
      const rest = amount - whole * t;
      return whole + (rest > 0.004 ? 0.5 : 0);
    }
  }
}

function formatTurns(n: number, lang: Lang): string {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  const near = (x: number) => Math.abs(frac - x) < 0.01;
  const sym = near(0) ? '' : near(0.5) ? '½' : near(1 / 3) ? '⅓' : near(2 / 3) ? '⅔' : near(0.25) ? '¼' : near(0.75) ? '¾' : '';
  if (sym) return whole === 0 ? sym : `${whole}${sym}`;
  return (Math.round(n * 100) / 100).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US');
}

function parseTickets(text: string): number[] {
  return text
    .split(/[,\s;]+/)
    .map((s) => parseFloat(s.replace(/[$]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

interface TechRow { id: number; name: string; tickets: string }

function TurnCalculator({ c, lang }: { c: Copy; lang: Lang }) {
  const [mode, setMode] = useState<CalcMode>('dollar');
  const [perTurn, setPerTurn] = useState('30');
  const [rows, setRows] = useState<TechRow[]>([
    { id: 1, name: c.sampleNames[0], tickets: '45, 25' },
    { id: 2, name: c.sampleNames[1], tickets: '65' },
    { id: 3, name: c.sampleNames[2], tickets: '20, 30' },
  ]);

  const results = useMemo(() => {
    const t = parseFloat(perTurn) || 30;
    const scored = rows.map((r, index) => ({
      ...r,
      index,
      turns: parseTickets(r.tickets).reduce((sum, a) => sum + turnsFor(a, mode, t), 0),
    }));
    const order = [...scored].sort((a, b) => a.turns - b.turns || a.index - b.index);
    const place = new Map(order.map((r, i) => [r.id, i + 1]));
    return { scored, place, next: order[0] };
  }, [rows, mode, perTurn]);

  const update = (id: number, patch: Partial<TechRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="bg-card border border-border rounded-2xl p-6 md:p-8 flex flex-col gap-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {c.calcMethod}
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as CalcMode)}>
            {(Object.keys(c.calcModes) as CalcMode[]).map((m) => (
              <option key={m} value={m}>{c.calcModes[m]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          {c.calcPerTurn}
          <input className={inputClass} inputMode="decimal" value={perTurn} disabled={mode === 'client_count'}
            onChange={(e) => setPerTurn(e.target.value.replace(/[^0-9.]/g, ''))} />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="hidden sm:grid grid-cols-[1fr_1.4fr_auto_auto_auto] gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>{c.calcTech}</span><span>{c.calcTickets}</span><span className="w-14 text-right">{c.calcColTurns}</span><span className="w-14 text-right">{c.calcColPlace}</span><span className="w-8" />
        </div>
        {results.scored.map((r) => (
          <div key={r.id} className="grid grid-cols-2 sm:grid-cols-[1fr_1.4fr_auto_auto_auto] gap-3 items-center border-b border-border pb-3 sm:border-0 sm:pb-0">
            <input className={inputClass} aria-label={c.calcTech} value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
            <input className={inputClass} aria-label={c.calcTickets} placeholder={c.calcTicketsHint} value={r.tickets} onChange={(e) => update(r.id, { tickets: e.target.value })} />
            <span className="w-14 sm:text-right text-sm font-bold text-foreground">{formatTurns(r.turns, lang)}</span>
            <span className="w-14 sm:text-right text-sm text-muted-foreground">#{results.place.get(r.id)}</span>
            <button type="button" aria-label={c.calcRemove} disabled={rows.length <= 2}
              onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
              className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button"
          onClick={() => setRows((rs) => [...rs, { id: Math.max(...rs.map((x) => x.id)) + 1, name: '', tickets: '' }])}
          className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted">
          <Plus className="w-4 h-4" aria-hidden="true" /> {c.calcAddTech}
        </button>
      </div>

      {results.next && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-base font-semibold text-foreground" aria-live="polite">
          {c.calcNext(results.next.name || `#${results.next.index + 1}`)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{c.calcTieNote}</p>
    </div>
  );
}

const EXAMPLE_AMOUNTS = [20, 30, 45, 65, 90];

export default function TurnSystemGuide({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const path = lang === 'en' ? EN_PATH : VI_PATH;
  const pageUrl = `${SITE}${path}`;
  const otherPath = lang === 'en' ? VI_PATH : EN_PATH;
  const ogImage = `${SITE}/assets/images/og-image.jpg`;
  const h2 = 'text-3xl md:text-4xl font-bold text-foreground';
  const heading = { fontFamily: 'var(--font-heading)' };

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
        '@type': 'Article',
        '@id': `${pageUrl}#article`,
        headline: c.h1,
        description: c.metaDescription,
        inLanguage: lang,
        mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
        author: { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Certxa' },
        publisher: { '@id': `${SITE}/#organization` },
        datePublished: '2026-10-30',
        dateModified: '2026-10-30',
        image: ogImage,
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}#faq`,
        inLanguage: lang,
        mainEntity: c.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  };

  const toc = [
    { id: 'methods', label: c.methodsHeading },
    { id: 'example', label: c.exampleHeading },
    { id: 'calculator', label: c.calcHeading },
    { id: 'rules', label: c.rulesHeading },
    { id: 'faq', label: c.faqHeading },
  ];

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
        <meta property="og:type" content="article" />
        <meta property="og:locale" content={lang === 'en' ? 'en_US' : 'vi_VN'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={c.metaTitle} />
        <meta name="twitter:description" content={c.metaDescription} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
      </Helmet>

      <main className="pt-16" lang={lang}>
        {/* ── The answer first ── */}
        <section className="bg-background border-b border-border">
          <div className="max-w-4xl mx-auto px-6 md:px-10 py-20 flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-primary tracking-widest uppercase">{c.eyebrow}</span>
              <Link to={otherPath} hrefLang={lang === 'en' ? 'vi' : 'en'} className="text-sm font-semibold text-primary underline underline-offset-4">
                {c.otherLangLabel}
              </Link>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-foreground leading-tight" style={heading}>{c.h1}</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">{c.answer}</p>
            <nav aria-label={c.tocHeading} className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-foreground">{c.tocHeading}</span>
              <ul className="flex flex-col gap-1.5">
                {toc.map((t) => (
                  <li key={t.id}><a href={`#${t.id}`} className="text-sm text-primary underline underline-offset-4">{t.label}</a></li>
                ))}
              </ul>
            </nav>
          </div>
        </section>

        {/* ── Methods ── */}
        <section id="methods" className="py-xxl bg-muted border-b border-border scroll-mt-20">
          <div className="max-w-5xl mx-auto px-6 md:px-10 flex flex-col gap-6">
            <h2 className={h2} style={heading}>{c.methodsHeading}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-3xl">{c.methodsIntro}</p>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    {c.methodsCols.map((col) => <th key={col} scope="col" className="px-5 py-3 font-semibold">{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {c.methods.map((m) => (
                    <tr key={m.name} className="border-b border-border last:border-0 align-top">
                      <th scope="row" className="px-5 py-4 font-bold text-foreground min-w-[11rem]">{m.name}</th>
                      <td className="px-5 py-4 text-muted-foreground leading-relaxed">{m.how}</td>
                      <td className="px-5 py-4 text-muted-foreground leading-relaxed">{m.suits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Worked example ── */}
        <section id="example" className="py-xxl bg-background border-b border-border scroll-mt-20">
          <div className="max-w-5xl mx-auto px-6 md:px-10 flex flex-col gap-6">
            <h2 className={h2} style={heading}>{c.exampleHeading}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-3xl">{c.exampleIntro}</p>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    {c.exampleCols.map((col, i) => <th key={col} scope="col" className={`px-5 py-3 font-semibold ${i ? 'text-right' : 'text-left'}`}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLE_AMOUNTS.map((a) => (
                    <tr key={a} className="border-b border-border last:border-0">
                      <th scope="row" className="px-5 py-3 text-left font-bold text-foreground">${a}</th>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatTurns(turnsFor(a, 'classic', 30), lang)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatTurns(turnsFor(a, 'dollar', 30), lang)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatTurns(turnsFor(a, 'proportional', 30), lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Calculator ── */}
        <section id="calculator" className="py-xxl bg-muted border-b border-border scroll-mt-20">
          <div className="max-w-4xl mx-auto px-6 md:px-10 flex flex-col gap-6">
            <h2 className={h2} style={heading}>{c.calcHeading}</h2>
            <p className="text-muted-foreground leading-relaxed">{c.calcIntro}</p>
            <TurnCalculator c={c} lang={lang} />
          </div>
        </section>

        {/* ── Rules ── */}
        <section id="rules" className="py-xxl bg-background border-b border-border scroll-mt-20">
          <div className="max-w-6xl mx-auto px-6 md:px-10 flex flex-col gap-8">
            <h2 className={h2} style={heading}>{c.rulesHeading}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {c.rules.map((r) => (
                <div key={r.title} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-2">
                  <h3 className="font-bold text-foreground" style={heading}>{r.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Arguments ── */}
        <section className="py-xxl bg-muted border-b border-border">
          <div className="max-w-4xl mx-auto px-6 md:px-10 flex flex-col gap-6">
            <h2 className={h2} style={heading}>{c.fightsHeading}</h2>
            <ol className="flex flex-col gap-3 list-decimal pl-6 text-foreground">
              {c.fights.map((f) => <li key={f} className="leading-relaxed pl-1">{f}</li>)}
            </ol>
          </div>
        </section>

        {/* ── Certxa ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-5xl mx-auto px-6 md:px-10 grid md:grid-cols-2 gap-10 items-start">
            <div className="flex flex-col gap-4">
              <h2 className={h2} style={heading}>{c.certxaHeading}</h2>
              <p className="text-muted-foreground leading-relaxed">{c.certxaBody}</p>
              <div className="flex flex-wrap gap-3">
                <Link to="/auth?mode=register" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity duration-200">
                  {c.ctaStart} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors duration-200">
                  {c.ctaPricing}
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                {c.readMore}{' '}
                <Link to={c.readMoreLink.href} className="text-primary font-semibold underline underline-offset-4">{c.readMoreLink.label}</Link>
              </p>
            </div>
            <ul className="flex flex-col gap-3 list-disc pl-5 text-foreground">
              {c.certxaList.map((item) => <li key={item} className="text-sm leading-relaxed">{item}</li>)}
            </ul>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="py-xxl bg-muted border-b border-border scroll-mt-20">
          <div className="max-w-4xl mx-auto px-6 md:px-10 flex flex-col gap-6">
            <h2 className={h2} style={heading}>{c.faqHeading}</h2>
            {c.faq.map((f) => (
              <div key={f.q} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3">
                <h3 className="font-bold text-foreground" style={heading}>{f.q}</h3>
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
                <h2 className="text-3xl font-extrabold text-primary-foreground" style={heading}>{c.finalHeading}</h2>
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
