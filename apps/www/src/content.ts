/**
 * All marketing copy for the Stocdup distributor site, ported verbatim from the
 * approved design canvas (artifact a2c99653-5023-4c1e-9832-da59fd563430).
 *
 * Claims follow the brief's guardrails (§18): benefits stated as intended
 * outcomes; honest about product maturity. Bracketed values are placeholders
 * for the team to fill in.
 */

export const NAV_LINKS = [
  { label: 'Product', href: '#product' },
  { label: 'Run smoother', href: '#run-smoother' },
  { label: 'Protect', href: '#protect' },
  { label: 'Sell more', href: '#sell-more' },
  { label: 'Why Stocdup?', href: '#why' },
] as const;

export type HeroVariant = 'default' | 'growth' | 'operations';

export const HERO: Record<
  HeroVariant,
  { kicker: string; headline: readonly string[]; markLine?: string; lead: string }
> = {
  default: {
    kicker: 'Built for UK wholesale',
    headline: ['Sell more.', 'Run smoother.'],
    markLine: 'Run smoother.',
    lead: 'Stocdup helps independent food and drink wholesalers win new customers, grow existing accounts and connect ordering, invoicing, accounting and delivery, without enterprise-scale complexity.',
  },
  growth: {
    kicker: 'Sell more. Run smoother.',
    headline: ['Help new customers find you, and existing customers buy more.'],
    markLine: 'find you',
    lead: 'The Stocdup marketplace puts your business and your range in front of hospitality businesses looking for new suppliers, and helps the customers you already have order more of it, while you keep control of prices and terms.',
  },
  operations: {
    kicker: 'Sell more. Run smoother.',
    headline: ['Fewer mistakes. Clearer accounts. More reliable deliveries.'],
    markLine: 'More reliable',
    lead: 'Stocdup brings orders into one flow, keeps invoice and account context where the decisions get made, and keeps delivery evidence attached to the order it belongs to.',
  },
};

export const HERO_CREDIBILITY =
  'Ordering, customer pricing, automatic invoicing and proof of delivery, in one place.';

export const HERO_SHOT_ALT =
  'Stocdup on screen: the sales dashboard, a distributor catalogue in the customer portal, and the delivery runs board.';

export const PROBLEM = {
  eyebrow: 'The day-to-day',
  heading: 'Wholesale is complicated enough.',
  lead: 'When orders, accounts and deliveries are handled across disconnected systems, small mistakes quickly become credits, redeliveries, payment disputes and damaged customer relationships.',
  points: [
    {
      title: 'Reaching new customers is hard.',
      body: 'Buyers need a way to discover your business and see what you sell.',
    },
    {
      title: 'Taking orders takes too much time.',
      body: 'Phone calls, emails and WhatsApp messages leave your team chasing details and entering orders by hand.',
    },
    {
      title: 'Every customer has different arrangements.',
      body: 'Agreed prices, product ranges and delivery days become harder to manage as you grow.',
    },
    {
      title: 'Outdated information and miscommunication cause mistakes.',
      body: "Order changes don't always reach the warehouse or drivers, leaving teams working from different instructions.",
    },
    {
      title: 'Delivery problems create more work.',
      body: 'Partial and failed deliveries lead to credits and invoice disputes, especially when records of what was delivered are hard to find.',
    },
    {
      title: 'Getting paid takes too much chasing.',
      body: "Checking overdue invoices and following up with customers eats into your team's time.",
    },
    {
      title: "Customers don't always know what else you sell.",
      body: 'They reorder familiar lines, leaving opportunities to grow each account unexplored.',
    },
    {
      title: 'Customer business can slip away quietly.',
      body: 'Smaller orders, fewer purchases and a shrinking product range are easy to miss until a valuable account has moved elsewhere.',
    },
  ],
} as const;

export const PRESSURE = {
  eyebrow: 'Your customers',
  heading: 'Hospitality is under pressure.',
  lead: 'The pubs, bars, restaurants, cafés and delis you supply are being squeezed. When your customers are under pressure, winning new ones and protecting the business you already have matters more than ever.',
  closer: 'Stocdup helps you do both.',
} as const;

export const GROWTH = {
  eyebrow: 'Sell more',
  heading: 'Win new customers on the Stocdup marketplace, and help existing customers buy more.',
  lead: 'Hospitality businesses use the Stocdup marketplace to discover new suppliers, putting your products in front of potential new customers. And the customers you already have can explore more of your range, so they order more of it.',
  cards: [
    {
      icon: 'search',
      title: 'The Stocdup marketplace',
      body: 'Trade customers find your business, browse your range and request to trade with you. You choose who to accept.',
    },
    {
      icon: 'grid',
      title: 'Product discovery',
      body: 'Help existing customers explore beyond their usual reorder list: new, seasonal, complementary and featured lines, and stock you want to move.',
    },
  ],
  controlTitle: 'You keep control of the relationship',
  controlPoints: [
    'Which customers you accept, and which catalogue each one sees',
    'Agreed trade prices, payment terms and delivery terms',
    'What gets promoted, featured or recommended',
  ],
  controlNote:
    'The marketplace makes the introduction. The relationship is yours.',
  screenshotAlt:
    'A wholesaler\'s page on the Stocdup marketplace: their banner and logo, the order cut-off and delivery day, and a row of wines from their catalogue with trade prices.',
} as const;

export const PROTECT = {
  eyebrow: 'Keep your customers',
  heading: 'Protect the business you have. See which customers are slipping away.',
  lead: 'Stocdup shows you your most valuable customers and products, and highlights the customers ordering less, spending less or narrowing their range. Those changes can signal financial stress or business slipping away, so you can spot problems early and focus your effort where it matters.',
  cards: [
    {
      icon: 'trend',
      title: 'Know your heavy hitters',
      body: 'See which customers and which products bring in the most, so you know what you cannot afford to lose.',
    },
    {
      icon: 'search',
      title: 'See who is at risk',
      body: 'Customers ordering less often, spending less or buying a narrower range are flagged for you, before the account goes quiet.',
    },
    {
      icon: 'scale',
      title: 'Act before it becomes a debt',
      body: 'A customer in trouble often shows it in their orders first. Seeing the change alongside their overdue invoices lets you have the conversation before more credit is extended.',
    },
  ],
  note: 'Early warning for your team, not credit scoring or automated decisions.',
  customerScreenshotLabel: 'Add product screenshot: single customer dashboard',
  screenshotAlt:
    'The Stocdup customer health dashboard: healthy, watch and at-risk customer counts, and a list of customers needing attention with the reason each was flagged.',
} as const;

export const OPERATIONS = {
  eyebrow: 'Run smoother',
  heading: 'Fewer mistakes. Clearer accounts. More reliable deliveries.',
  lead: 'Keep orders, invoices, payment status and delivery records connected, so your team has the information it needs from order to payment.',
  rows: [
    {
      icon: 'clipboard',
      title: 'Get the order right',
      body: 'Let customers order from their agreed product range, at their agreed prices and terms, on available delivery dates. Your team can place orders on their behalf using the same arrangements.',
      points: [
        'Less manual order entry',
        'Customer-specific product ranges, prices and terms',
        'Minimum order requirements applied',
        'Available delivery dates shown',
        "Staff can order on a customer's behalf",
        'An audit trail of changes and actions',
      ],
    },
    {
      icon: 'bolt',
      title: 'Raise invoices automatically',
      body: 'When an order is accepted, Stocdup creates the invoice in your accountancy software, such as Xero, using the agreed order prices. That means less admin and fewer missed invoices.',
      points: [
        'No need to type invoices by hand',
        'Order details and agreed prices carried through',
        'Accepted orders trigger invoicing automatically',
        'Invoice and payment status linked to the order',
      ],
    },
    {
      icon: 'scale',
      title: 'See overdue invoices before the next order',
      body: "Give your operations team a clear view of the customer's outstanding invoices and payment status, so they can follow up and make an informed decision before accepting another order.",
      points: [
        'Customers with overdue invoices flagged',
        'Order, invoice and payment information together',
        'Fewer separate systems to check',
      ],
    },
    {
      icon: 'camera',
      title: 'Track deliveries and keep the evidence',
      body: 'Generate delivery manifests with scannable QR codes. Drivers scan each code to open the delivery in the app, record the drop location and capture signatures, photos and notes. Everything stays linked to the original order, making delivery queries and invoice disputes easier to resolve.',
      points: [
        'Delivery manifests with scannable QR codes',
        'Drop locations and recipient or safe-drop details recorded',
        'Signatures and photo evidence captured',
        'Full, partial and failed deliveries recorded, with notes explaining any issues',
        'Delivery evidence accessible from the order',
      ],
    },
  ],
} as const;

export const ANY_SCALE = {
  eyebrow: 'Whatever your size',
  heading: 'Built for small operations. Grows with you.',
  lead: 'Stocdup fits a two-person operation and a regional distributor with a fleet. It is quick to adopt, light enough for a small team to run day to day, and it grows with the business rather than being replaced by it.',
  cards: [
    {
      icon: 'bolt',
      title: 'Quick to start',
      body: 'No lengthy implementation programme and no dedicated IT team. Get going around the catalogue, customers and terms you already have.',
    },
    {
      icon: 'people',
      title: 'Light for a small team',
      body: 'Ordering, accounts and delivery in one place, so a few people can run the operation without switching between systems all day.',
    },
    {
      icon: 'trend',
      title: 'Grows with you',
      body: 'Add customers, products, price lists, drivers and delivery days as the business grows. The same system at 20 accounts and at 2,000.',
    },
  ],
} as const;

export const CONNECTED_FLOW = {
  eyebrow: 'One connected flow',
  heading: 'One connected flow, from order to paid invoice.',
  steps: [
    'A customer finds you on the marketplace',
    'They order at agreed prices and terms',
    'You review and accept the order',
    'The invoice is raised automatically in your accounting software',
    'It goes out on a delivery run, with proof recorded against the order',
    'Payment status comes back, so you can see what has been paid',
  ],
  closer: 'Continuity, not a re-key at every step.',
} as const;

export const UK_NATIVE = {
  eyebrow: 'Built for UK wholesale',
  heading: 'Built around the way UK wholesalers work.',
  lead: 'Designed for the terminology, trading relationships, accounting practices and delivery realities of independent UK wholesale, not adapted from somewhere else.',
  points: [
    'Pounds sterling and UK VAT handling',
    'Trade accounts and credit terms',
    'Customer-specific catalogues',
    'Agreed prices and payment terms',
    'Automatic invoicing in Xero',
    'Postcode-based delivery areas',
    'Delivery days and order cut-offs',
    'Minimum-order rules',
  ],
  shots: [
    {
      tab: 'Stocdup · Orders',
      caption: 'Orders.',
      line: 'Bring orders into one manageable workflow.',
      image: {
        src: '/screenshot5.png',
        width: 1917,
        height: 917,
        alt: 'A completed order in Stocdup: the customer, its invoice paid in full, the products ordered, the delivery address and a timeline from submitted to delivered and paid.',
      },
    },
    {
      tab: 'Stocdup · Delivery runs',
      caption: 'Delivery runs.',
      line: 'Organise deliveries and keep the evidence.',
      image: {
        src: '/screenshot3.png',
        width: 1920,
        height: 920,
        alt: 'The Stocdup delivery runs board: a week of delivery days, with each route listing its stops in order.',
      },
    },
    {
      tab: 'Stocdup · Proof of delivery',
      caption: 'Proof of delivery.',
      line: 'See who signed for every drop, backed by a photo, the delivery time and the location.',
      image: {
        src: '/screenshot6.png',
        width: 1920,
        height: 920,
        alt: 'Proof of delivery for an order in Stocdup: delivered and handed to a named person, with the driver, the run, the time, a photo of the wine delivered and the recipient\'s signature.',
      },
    },
  ],
  closer:
    'Practical workflows for smaller operational teams, and support for regional distributors.',
} as const;

export const PRICING = {
  eyebrow: 'Pricing',
  heading: 'Modern wholesale software without the enterprise price tag.',
  lead: 'Stocdup is built for independent wholesalers, not only national distributors with enterprise software budgets and long implementation programmes.',
  cardTitle: 'What we can say now',
  cardPoints: [
    'Pricing is being designed around independent wholesalers, not enterprise tiers.',
    "Register your interest and we'll share pricing as it's confirmed.",
  ],
  disclaimer:
    '[No published prices, savings claims or contract terms until they can be substantiated.]',
} as const;

export const FOUNDER = {
  eyebrow: 'Founder story',
  heading: 'Why we built Stocdup',
  paragraphs: [
    'Independent wholesalers run remarkable businesses on relationships and hard-won knowledge, then lose hours to orders arriving through five channels, re-keyed into a second system, and chased across disconnected records when something goes wrong.',
    "The software built for that problem is mostly built for national distributors: priced, scoped and implemented for a scale most independents don't have. The rest is generic commerce software that doesn't understand trade accounts, agreed prices or delivery days.",
    "Growth and operational control aren't separate projects. A customer who can't explore your range easily also can't order it accurately; an account you can't see clearly is one you keep selling to on credit. Stocdup connects the two: discovery and ordering through to accounting, delivery and proof.",
    'We built it with an active UK distributor, one workflow at a time, so it fits the way a wholesale business actually runs.',
  ],
  signoff: 'Rick Walsh, founder, Stocdup',
} as const;

export const FAQ = {
  heading: 'Questions distributors ask',
  items: [
    {
      q: 'What is Stocdup?',
      a: 'A marketplace and operations platform for wholesalers. It helps hospitality businesses discover you, and connects customer ordering, automatic invoicing and delivery, including proof of delivery.',
    },
    {
      q: 'Who is it for?',
      a: 'Independent UK food and drink wholesalers, including specialist and regional drinks distributors serving cafés, pubs, restaurants, hotels, delis and retailers.',
    },
    {
      q: 'Is Stocdup available now?',
      a: "We're onboarding distributors selectively at the moment rather than opening general sign-up. Register your interest and we'll be in touch about getting you set up.",
    },
    {
      q: 'Does it replace my accounting software?',
      a: 'No. Stocdup raises an invoice in your accounting software, such as Xero, for every accepted order. It does not replace the accounting system.',
    },
    {
      q: 'Can customers order at their agreed prices?',
      a: 'Yes. Customers see the catalogue, prices and conditions tied to their trade relationship with you.',
    },
    {
      q: 'Can Stocdup show overdue invoices?',
      a: "Within the scope of the connected accounting integration, it can surface invoice and payment status so overdue accounts are visible. It doesn't do debt collection or automated credit decisions, and it doesn't support every accounting system.",
    },
    {
      q: 'Does Stocdup support deliveries?',
      a: 'Yes. Plan delivery runs by day and route, and capture proof of delivery for every drop: signature, photos, notes, the delivery time and the location.',
    },
    {
      q: 'How much will it cost?',
      a: "Pricing is being designed for independent wholesalers. Register your interest and we'll share pricing information as it's confirmed.",
    },
    {
      q: 'What happens after I register?',
      a: "We'll get in touch to understand your needs, show you the platform, and talk about getting you set up.",
    },
  ],
} as const;

export const REGISTER = {
  eyebrow: 'Register interest',
  heading: 'Tell us about your wholesale business.',
  lead: "If Stocdup looks like a fit, we'll be in touch to understand your needs and show you the product. No sales pipeline, no obligation.",
  whatHappens: [
    'A short conversation about how you run orders and deliveries today',
    'A walkthrough of the platform',
    "Early access, if it's a fit",
  ],
  roles: [
    'Founder / owner',
    'Managing director',
    'Sales / commercial',
    'Operations',
    'Finance',
    'E-commerce / digital',
    'Other',
  ],
  interests: [
    'Winning new customers',
    'Keeping existing customers',
    'Order accuracy',
    'Account & invoice visibility',
    'Delivery disputes',
    'Admin time',
  ],
  privacy: "We'll only use your details to talk to you about Stocdup.",
} as const;

export const CONFIRMATION = {
  heading: "Thanks, we've got your details.",
  body: "We'll review what you've told us and get in touch if Stocdup looks like a fit for your business. That's usually within a few working days.",
  stepsLabel: 'What happens next',
  steps: [
    'A short conversation about how you run orders and deliveries today',
    'A walkthrough of the platform, tailored to how you work',
    'A plan for getting you set up',
  ],
} as const;

export const FOOTER = {
  tagline: 'Built for UK wholesale.',
  links: [
    { label: 'Product', href: '#product' },
    { label: 'Why Stocdup?', href: '#why' },
    { label: 'Register interest', href: '#register' },
    { label: 'Privacy', href: '/privacy' },
  ],
  legal:
    '© 2026 Stocdup. [Company registration details]. Product features described reflect the current product.',
} as const;

export const CTA_LABEL = 'Register interest';
