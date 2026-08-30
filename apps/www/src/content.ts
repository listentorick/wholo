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
  { label: 'Sell more', href: '#sell-more' },
  { label: 'Run smoother', href: '#run-smoother' },
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
    lead: 'Stocdup helps independent food and drink wholesalers win new customers, grow existing accounts and connect ordering, accounting and delivery, without enterprise-scale complexity.',
  },
  growth: {
    kicker: 'Sell more. Run smoother.',
    headline: ['Help new customers find you, and existing customers buy more.'],
    markLine: 'find you',
    lead: 'Stocdup gives suitable trade customers a way to discover your business and your range, and helps the customers you already have order more of it, while you keep control of prices and terms.',
  },
  operations: {
    kicker: 'Sell more. Run smoother.',
    headline: ['Fewer mistakes. Clearer accounts. More reliable deliveries.'],
    markLine: 'More reliable',
    lead: 'Stocdup brings orders into one flow, keeps invoice and account context where the decisions get made, and keeps delivery evidence attached to the order it belongs to.',
  },
};

export const HERO_CREDIBILITY =
  'Ordering, customer pricing, accounting and proof of delivery, in one place.';

export const PROOF_STRIP = {
  line: 'For the independent UK drinks and food wholesalers that enterprise platforms overlook.',
} as const;

export const PROBLEM = {
  eyebrow: 'The day-to-day',
  heading: 'Wholesale is complicated enough.',
  lead: 'When orders, accounts and deliveries are handled across disconnected systems, small mistakes quickly become credits, redeliveries, payment disputes and damaged customer relationships.',
  points: [
    'An order arrives by message and is entered incorrectly.',
    'The wrong product, quantity, price or delivery date is recorded.',
    'Warehouse and delivery teams work from outdated information.',
    'A customer reports missing items, but the delivery evidence is hard to find.',
    'Partial and failed deliveries turn into credits and invoice disputes.',
    'Another order is accepted before anyone sees the earlier invoices are overdue.',
    'Customers reorder the same few lines because the wider range is hard to explore.',
    "Account managers notice a customer's activity has dropped off too late.",
  ],
} as const;

export const GROWTH = {
  eyebrow: 'Sell more',
  heading: 'Help more customers find you, and existing customers buy more.',
  lead: 'Growth comes from concrete mechanisms, not a slogan. You stay in control of who you accept, what they see and the prices they pay.',
  cards: [
    {
      icon: 'search',
      title: 'Business discovery',
      body: 'Give suitable trade customers a way to find your business, understand your range and request a relationship. You choose whether to accept it.',
    },
    {
      icon: 'grid',
      title: 'Product discovery',
      body: 'Help existing customers explore beyond their usual reorder list: new, seasonal, complementary and featured lines, and stock you want to move.',
    },
    {
      icon: 'trend',
      title: 'Account growth',
      body: 'See when a regular customer stops ordering, when frequency drops, or when a category falls away, in time for an account manager to step in.',
    },
  ],
  controlTitle: 'You keep control of the relationship',
  controlPoints: [
    'Which customers you accept, and which catalogue each one sees',
    'Agreed trade prices, payment terms and delivery terms',
    'What gets promoted, featured or recommended',
  ],
  controlNote:
    'Stocdup is not an open marketplace. Trade relationships and pricing stay yours.',
  screenshotLabel: 'Add product screenshot: customer activity',
} as const;

export const OPERATIONS = {
  eyebrow: 'Run smoother',
  heading: 'Fewer mistakes. Clearer accounts. More reliable deliveries.',
  lead: 'One flow for orders, account context where the decisions get made, and delivery evidence that stays with the order.',
  rows: [
    {
      icon: 'clipboard',
      title: 'Get the order right',
      body: 'Bring customer orders into one manageable flow, keeping the products, quantities, prices, terms and delivery details agreed with each customer.',
      points: [
        'Less manual re-entry',
        'The correct customer catalogue',
        'Agreed prices and minimums applied',
        'Valid delivery dates shown',
        "Staff can order on a customer's behalf",
        'An audit trail of changes and actions',
      ],
    },
    {
      icon: 'scale',
      title: 'Know where the account stands',
      body: 'Keep order and invoice information connected, so your team can spot overdue accounts and make a better-informed call before accepting the next order.',
      points: [
        'Relevant invoice and payment status',
        'Customers with overdue invoices flagged',
        'Appropriate account visibility for ops staff',
        'Fewer separate systems to check',
      ],
      note: 'Improved visibility and earlier intervention, not debt collection or automated credit decisions.',
    },
    {
      icon: 'camera',
      title: 'Know what was delivered',
      body: 'Keep the delivery outcome, photos, signature and notes attached to the original order, so a dispute is settled by opening the order, not searching through messages.',
      points: [
        'Delivered to a person or a safe location',
        'Photos and a signature where appropriate',
        'Partial deliveries and notes recorded',
        'Proof reachable from the order',
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
  heading: 'One connected flow, from order to delivery.',
  steps: [
    'A customer discovers a product',
    'They order at agreed prices and terms',
    'You review and accept the order',
    'Accounting information stays connected',
    'It is assigned to a delivery run',
    'The driver records proof against the order',
  ],
  closer: 'Continuity, not a re-key at every step.',
} as const;

export const EVIDENCE = {
  eyebrow: 'The product',
  heading: 'Built for how UK wholesale actually runs.',
  lead: 'Every screen maps to a real job in a distribution business: take the order, apply the right price, get it delivered, keep the books straight.',
  shots: [
    { tab: 'Stocdup · Orders', caption: 'Orders.', line: 'Bring orders into one manageable workflow.', label: 'Add product screenshot: orders' },
    { tab: 'Stocdup · Delivery runs', caption: 'Delivery runs.', line: 'Organise deliveries and keep the evidence.', label: 'Add product screenshot: delivery runs' },
  ],
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
    'UK accounting integrations',
    'Postcode-based delivery areas',
    'Delivery days and order cut-offs',
    'Minimum-order rules',
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
  signoff: '[Founder name], founder, Stocdup',
} as const;

export const FAQ = {
  heading: 'Questions distributors ask',
  items: [
    {
      q: 'What is Stocdup?',
      a: 'A wholesale commerce and operations platform that connects product discovery, customer ordering, accounting and delivery, including proof of delivery.',
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
      a: "No. Stocdup connects wholesale ordering and operations with your accounting platform; it doesn't replace the accounting system.",
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
      a: "Delivery planning and proof of delivery (photos, signature, notes, partial deliveries) work today. We'll walk you through exactly what's available when we talk.",
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
