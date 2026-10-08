/**
 * The Stocdup privacy notice, verbatim from the approved copy. Wording,
 * punctuation and heading capitals are reproduced exactly — do not edit the
 * text here without a revised notice from Stocdup.
 */

export type NoticeBlock =
  /** A plain paragraph. */
  | { type: 'p'; text: string }
  /** A paragraph that opens with a labelled term ("Backups: …"). */
  | { type: 'term'; term: string; text: string }
  /** A sub-heading inside a section. */
  | { type: 'subheading'; text: string }
  /** Short lines kept together, such as contact details. */
  | { type: 'lines'; lines: readonly string[] };

export interface NoticeSection {
  number: number;
  title: string;
  blocks: readonly NoticeBlock[];
}

export const PRIVACY_EMAIL = 'privacy@stocdup.com';

export const PRIVACY_NOTICE_TITLE = 'STOCDUP PRIVACY NOTICE';

export const PRIVACY_NOTICE_UPDATED = '8 October 2026';

export const PRIVACY_NOTICE: readonly NoticeSection[] = [
  {
    number: 1,
    title: 'ABOUT STOCDUP AND THIS NOTICE',
    blocks: [
      {
        type: 'p',
        text: 'Stocdup is an online platform for British wholesalers supplying pubs, bars, restaurants, cafés and delis. It provides a marketplace where hospitality businesses can discover suppliers, alongside tools for managing customer relationships, orders, deliveries and invoicing. It also provides reporting on customer purchasing activity and product performance.',
      },
      {
        type: 'p',
        text: 'This notice explains how stocdup limited (“Stocdup”, “we”, “us” or “our”) handles personal information in connection with www.stocdup.com, our platform, enquiries and business communications. Our service currently operates in the United Kingdom. We handle personal information in accordance with applicable UK data protection law, including the UK GDPR and the Data Protection Act 2018, as amended.',
      },
      {
        type: 'term',
        term: 'Email',
        text: 'privacy@stocdup.com',
      },
      {
        type: 'p',
        text: 'Personal information means information relating to an identified or identifiable individual. Business records can contain personal information, including details of employees, business contacts and sole traders.',
      },
    ],
  },
  {
    number: 2,
    title: 'OUR ROLE AND WHO IS RESPONSIBLE FOR YOUR INFORMATION',
    blocks: [
      {
        type: 'p',
        text: 'When Stocdup decides why and how personal information is used, we are its controller. This includes information used to manage our own business relationships, administer platform accounts, handle enquiries, protect our service and conduct our own marketing.',
      },
      {
        type: 'p',
        text: 'When we handle personal information on a wholesaler’s instructions to provide its customer management, ordering, delivery, invoicing and reporting services, we act as a processor. The wholesaler is responsible for deciding the purposes and lawful basis for that processing and for providing appropriate privacy information to its customers and other affected individuals. Our handling of those records is governed by our data processing agreement with the wholesaler.',
      },
      {
        type: 'p',
        text: 'Where we use personal information for our own marketplace, analytics and aggregated reporting, or other independent purposes, we act as controller for those activities. This distinction applies to the particular use of the information, rather than to an entire account or database.',
      },
      {
        type: 'p',
        text: 'If your question concerns a wholesaler’s use of your information, contact that wholesaler. You can also contact us, and we will help identify the appropriate organisation and assist it with your request where we act as processor.',
      },
    ],
  },
  {
    number: 3,
    title: 'INFORMATION WE HANDLE AND WHERE IT COMES FROM',
    blocks: [
      {
        type: 'p',
        text: 'Depending on the features you use and your relationship with us, we handle:',
      },
      {
        type: 'term',
        term: 'Account and contact information',
        text: 'names, business names, work email addresses, telephone numbers, usernames, user identifiers, organisation membership, roles, authentication information and communication preferences.',
      },
      {
        type: 'term',
        term: 'Customer and transaction records',
        text: 'customer contact details, billing and delivery addresses, orders, purchased products, quantities, agreed prices, payment terms, invoice details and relevant invoice or payment status. Product information is personal information only where it relates to an identifiable individual.',
      },
      {
        type: 'term',
        term: 'Delivery records',
        text: 'delivery instructions, delivery status, recipient details, signatures, photographs and notes captured as proof of delivery. Device latitude, longitude and location accuracy are captured once at the point of delivery alongside the signature, photographs and notes. This is a point-of-delivery location record, not continuous location tracking.',
      },
      {
        type: 'term',
        term: 'Communications',
        text: 'enquiries, support requests, correspondence and information you choose to provide when contacting us.',
      },
      {
        type: 'term',
        term: 'Register-interest submissions',
        text: 'your name, work email address, business, role, interests and free-text message submitted through the website form. Submissions are emailed to Stocdup for handling your enquiry.',
      },
      {
        type: 'term',
        term: 'Technical and activity information',
        text: 'IP addresses, browser and device information, authentication events, timestamps, error reports, and records of actions within the platform where recorded for security, troubleshooting and accountability. This information may be linked to an identifiable account.',
      },
      {
        type: 'p',
        text: 'We obtain information directly from you, from wholesalers and authorised users who create or update records, and automatically through use of the website and platform. Wholesalers may provide information about their staff, business contacts and customers even where those individuals do not have a Stocdup account.',
      },
      {
        type: 'p',
        text: 'From a connected wholesaler’s Xero account, we retrieve its contact list, items, tax rates, and invoice and payment status. The contact list can include individuals who are not Stocdup customers and have not registered with Stocdup. Item descriptions and other accounting records may also contain personal information. See section 6.',
      },
      {
        type: 'p',
        text: 'We do not request special-category information, such as health information, racial or ethnic origin or religious beliefs, for our normal service. Financial and invoice information is not, by itself, special-category information under UK GDPR. Please avoid including unnecessary personal or special-category information in free-text notes, photographs and support messages.',
      },
      {
        type: 'p',
        text: 'Information needed to establish and secure an account or fulfil an order must be provided for the relevant feature to work. If it is not provided, we may be unable to create the account or provide that feature. Optional information is identified as optional where requested.',
      },
    ],
  },
  {
    number: 4,
    title: 'WHY WE USE INFORMATION AND OUR LAWFUL BASES',
    blocks: [
      {
        type: 'p',
        text: 'For activities where we are controller, we use personal information for the following purposes:',
      },
      {
        type: 'term',
        term: 'Providing accounts and managing business relationships',
        text: 'to register users, administer access and communicate about the service. We rely on performance of a contract where the individual is a party to that contract and the processing is necessary to perform it or take requested pre-contract steps. For employees or representatives of business customers, we rely on our legitimate interests in providing and administering the service and maintaining those business relationships.',
      },
      {
        type: 'term',
        term: 'Operating the marketplace',
        text: 'to manage marketplace accounts and enable business contacts and supplier discovery. We rely on contractual necessity where applicable, or our legitimate interests in operating a business marketplace and enabling relevant business connections.',
      },
      {
        type: 'term',
        term: 'Register-interest enquiries',
        text: 'to receive and respond to website submissions, understand your business needs and discuss your interest in Stocdup. Submissions are emailed to us so we can handle them. We rely on our legitimate interests in responding to business enquiries and developing relevant business relationships. Where an individual asks us to take steps towards entering a contract with them, and processing is necessary for those steps, we rely on that pre-contractual basis. Registering interest does not by itself provide consent for unrelated marketing; any ongoing marketing follows the separate marketing rules below.',
      },
      {
        type: 'term',
        term: 'Support and service communications',
        text: 'to respond to enquiries, resolve problems and send operational messages. We rely on contractual necessity where applicable, or our legitimate interests in supporting users and running the service.',
      },
      {
        type: 'term',
        term: 'Security and accountability',
        text: 'to manage access, investigate misuse, troubleshoot faults and maintain appropriate records. We rely on our legitimate interests in protecting users, business records and the reliability of our service.',
      },
      {
        type: 'term',
        term: 'Improving our service',
        text: 'to understand service performance and improve functionality. Where this involves personal information, we rely on our legitimate interests in maintaining and improving the service, subject to applicable cookie and tracking requirements.',
      },
      {
        type: 'term',
        term: 'Legal compliance',
        text: 'to meet applicable legal obligations, including those relating to our own accounting and tax records. We rely on legal obligation where a specific obligation applies.',
      },
      {
        type: 'term',
        term: 'Legal claims',
        text: 'to establish, exercise or defend legal claims. We rely on our legitimate interests in protecting our legal rights.',
      },
      {
        type: 'term',
        term: 'Marketing',
        text: 'to communicate about Stocdup’s services where permitted by law. For unsolicited marketing emails or texts to sole traders and other individual subscribers, including certain partnerships, we obtain consent unless the applicable soft opt-in requirements are met. The soft opt-in applies only where we obtained the contact details directly during a sale or negotiations for a sale of our own products or services, market our own similar products or services, and offered a clear opportunity to opt out when collecting the details and in every subsequent message.',
      },
      {
        type: 'p',
        text: 'For corporate subscribers, such as limited companies and limited liability partnerships, we may send relevant business marketing emails without prior consent where permitted by law. Where personal information is involved, we rely on our legitimate interests in promoting relevant Stocdup services, subject to an assessment of individuals’ rights and expectations. A work email address alone does not establish that the recipient is a corporate subscriber.',
      },
      {
        type: 'p',
        text: 'Where consent is required for electronic marketing, we rely on consent as our data protection lawful basis. Where a valid soft opt-in applies, we rely on our legitimate interests, subject to the applicable assessment. Every marketing email or text identifies us and provides a way to opt out. You can object to direct marketing at any time by using that option or emailing privacy@stocdup.com. Registering interest does not automatically subscribe you to unrelated marketing.',
      },
      {
        type: 'term',
        term: 'Analytics and aggregated reporting',
        text: 'where personal information is needed for Stocdup’s own analytics or to produce anonymised statistics, we rely on our legitimate interests in understanding purchasing trends, improving the platform and producing useful market insights, subject to necessity, compatibility and balancing assessments. Further details are in section 9.',
      },
      {
        type: 'p',
        text: 'Where we rely on legitimate interests, we assess whether the processing is necessary and whether individuals’ interests, rights and freedoms override those interests.',
      },
      {
        type: 'p',
        text: 'Where we act as processor, we use customer information on the wholesaler’s documented instructions to manage customer records, orders, delivery dates and runs, proof of delivery, invoices and purchasing reports. The wholesaler is responsible for the lawful basis for these activities.',
      },
    ],
  },
  {
    number: 5,
    title: 'WHO CAN ACCESS INFORMATION AND WHO WE SHARE IT WITH',
    blocks: [
      {
        type: 'term',
        term: 'Relevant wholesalers and authorised users',
        text: 'information is available to the organisations and users who need it to manage the relevant relationship, order, delivery or invoice. This can include authorised administrators, operations staff, drivers and accounting staff, depending on their access permissions. A wholesaler receiving an order receives the information needed to handle that order.',
      },
      {
        type: 'p',
        text: 'Staff details are available to authorised wholesaler administrators in the admin interface so they can manage their team. Customers also provide contact information, which is available to the relevant wholesaler and its authorised staff for managing the customer relationship, orders and deliveries.',
      },
      {
        type: 'term',
        term: 'Service providers',
        text: 'we use providers supporting hosting, storage, authentication, communications and service operation where they require access to personal information. Providers acting as our processors are subject to appropriate contractual requirements. They may use authorised subprocessors subject to applicable safeguards.',
      },
      {
        type: 'term',
        term: 'Cloudflare',
        text: 'we use Cloudflare to handle IP addresses and request information and to store delivery photographs, product photographs and backups. Photographs constitute personal information where they identify or relate to an identifiable individual.',
      },
      {
        type: 'term',
        term: 'Connected accounting services',
        text: 'information is shared with Xero where a wholesaler enables the integration, as explained below.',
      },
      {
        type: 'term',
        term: 'Professional advisers and authorities',
        text: 'we may disclose information where necessary for professional advice, compliance with legal obligations, or establishing, exercising or defending legal claims.',
      },
      {
        type: 'term',
        term: 'Business changes',
        text: 'relevant information may be disclosed to advisers or prospective purchasers where necessary in connection with a proposed merger, acquisition or sale, subject to appropriate confidentiality and data protection arrangements.',
      },
    ],
  },
  {
    number: 6,
    title: 'XERO INVOICE INTEGRATION',
    blocks: [
      {
        type: 'p',
        text: 'Where a wholesaler connects its Xero account, Stocdup sends the customer and invoice information needed to create invoices for accepted orders in that account.',
      },
      {
        type: 'p',
        text: 'For the invoice-creation call, Stocdup sends a Xero contact ID, line descriptions, quantities, prices, tax, an invoice reference and a due date. That call uses the contact ID to associate the invoice with a contact already held in Xero; it does not send the contact’s name, contact details or billing address as separate fields. The identifier and invoice content can still constitute personal information where linked to an identifiable individual.',
      },
      {
        type: 'p',
        text: 'Stocdup also retrieves the connected wholesaler’s Xero contact list, items, tax rates, and invoice and payment status. These records support the connected accounting and invoicing workflow. The imported contact list may include people who are not Stocdup customers and have never used Stocdup. We handle that information on the wholesaler’s instructions as described in section 2.',
      },
      {
        type: 'p',
        text: 'The wholesaler enables the connection and is responsible for authorising the use of its Xero account. Xero’s role and processing terms depend on its agreement with the account holder. For customer information entered into Xero under a wholesaler’s subscription, Xero generally acts as processor for that wholesaler. Stocdup’s processing remains subject to its own arrangements with the wholesaler.',
      },
      {
        type: 'lines',
        lines: [
          'Xero’s data processing terms: https://www.xero.com/uk/legal/terms/data-processing/',
          'Xero’s privacy notice, covering its own controller activities: https://www.xero.com/uk/legal/privacy/',
        ],
      },
      {
        type: 'p',
        text: 'Disconnecting an integration does not itself delete invoices or customer records already created in Xero. Those records remain subject to the account holder’s instructions and Xero’s applicable terms and retention arrangements.',
      },
    ],
  },
  {
    number: 7,
    title: 'COOKIES AND SIMILAR TECHNOLOGIES',
    blocks: [
      {
        type: 'p',
        text: 'The only cookies we use are those set by our self-hosted authentication service to support sign-in, maintain authentication sessions and protect access to the platform. We do not use cookies for advertising or analytics.',
      },
      {
        type: 'p',
        text: 'These authentication cookies are necessary to provide the sign-in service you request. You can block or delete cookies through your browser settings, but doing so may prevent you from signing in or remaining signed in.',
      },
    ],
  },
  {
    number: 8,
    title: 'PURCHASING REPORTS AND AUTOMATED PROCESSING',
    blocks: [
      {
        type: 'p',
        text: 'Stocdup provides reports on customer purchasing activity and product performance, including changes in order frequency, spending and the range of products purchased. When produced for a wholesaler on its instructions, these reports form part of our processing for that wholesaler.',
      },
      {
        type: 'p',
        text: 'Business records and reports may contain personal information, particularly where they relate to sole traders or identifiable business contacts. Reports about identifiable individuals can involve profiling depending on how they are produced and used.',
      },
      {
        type: 'p',
        text: 'At launch, Stocdup will not make decisions based solely on automated processing that have legal or similarly significant effects on individuals.',
      },
    ],
  },
  {
    number: 9,
    title: 'ANALYTICS AND AGGREGATED REPORTING',
    blocks: [
      {
        type: 'p',
        text: 'Alongside reports provided to individual wholesalers, Stocdup analyses platform activity and purchasing data to understand usage, product demand, purchasing patterns and market trends. We use these insights to improve the service and develop aggregated statistics, benchmarks and market reports.',
      },
      {
        type: 'p',
        text: 'We may combine data across wholesalers and customers to produce these statistics. We may use and share anonymised, aggregated results for research, industry reporting, benchmarking, product development and Stocdup’s marketing and promotional materials.',
      },
      {
        type: 'p',
        text: 'Where these activities involve personal information, including information relating to sole traders, Stocdup acts as controller for its own analytics purposes. Creating anonymous information from personal information is itself processing and is subject to the lawful basis and safeguards described in this notice. Records processed solely on a wholesaler’s instructions are used only within the scope of our agreement with that wholesaler; this notice does not override those contractual restrictions.',
      },
      {
        type: 'p',
        text: 'Before sharing or publishing results, we take steps to ensure that individuals and individual businesses cannot reasonably be identified from them, including by combining results with other reasonably available information. These steps include grouping results appropriately and withholding or combining small groups where necessary. We do not publish identifiable customer records, individual orders or customer-specific agreed prices as part of these reports.',
      },
      {
        type: 'p',
        text: 'Simply removing names or replacing them with identifiers does not necessarily make information anonymous. Information that remains identifiable continues to be treated as personal information and is subject to the retention and rights provisions in this notice. Genuinely anonymised statistics may be retained for as long as they remain useful because they no longer constitute personal information.',
      },
    ],
  },
  {
    number: 10,
    title: 'INTERNATIONAL PROCESSING AND TRANSFERS',
    blocks: [
      {
        type: 'p',
        text: 'Stocdup is hosted in the United Kingdom. Backups are stored with Cloudflare in Western Europe, within the European Union. Personal information may also be processed outside the UK by connected services or other providers; these hosting and backup locations do not determine where every provider processes information or accesses it for support.',
      },
      {
        type: 'p',
        text: 'Xero’s published terms describe international processing and transfer arrangements. The arrangements applying to information in a wholesaler’s Xero account depend on its agreement with Xero.',
      },
      {
        type: 'p',
        text: 'Where we are responsible for a restricted transfer, we use an applicable lawful transfer mechanism, such as UK adequacy regulations or appropriate contractual safeguards, and undertake any required assessment.',
      },
      {
        type: 'p',
        text: 'You can contact privacy@stocdup.com for information about the safeguards relevant to your information and how to obtain a copy, subject to appropriate redactions.',
      },
      {
        type: 'p',
        text: 'Stocdup currently has no developers, administrators or support personnel accessing personal information from outside the United Kingdom. This statement concerns Stocdup’s own personnel and contractors; processing by connected services and other providers is described above.',
      },
    ],
  },
  {
    number: 11,
    title: 'HOW LONG WE KEEP INFORMATION',
    blocks: [
      {
        type: 'p',
        text: 'We keep personal information only for as long as needed for the relevant purpose. Closing an individual user account does not automatically delete the business’s customer, order, delivery or invoice records.',
      },
      {
        type: 'term',
        term: 'Account and business contact information',
        text: 'retained while needed to administer the relationship and afterwards only where needed for unresolved support matters, legal obligations or legal claims.',
      },
      {
        type: 'term',
        term: 'Wholesaler customer, order and delivery records',
        text: 'retained during the service in accordance with the wholesaler’s instructions and our data processing agreement. When the service ends, the wholesaler has a 30-day window to export its records, after which we delete them from our live systems. The wholesaler may request earlier deletion. Records are returned or deleted in accordance with its instructions, unless applicable UK law requires retention. Backup copies expire separately under the backup schedule described below.',
      },
      {
        type: 'term',
        term: 'Stocdup’s own accounting and tax records',
        text: 'retained for the period required by applicable accounting and tax obligations. This is separate from invoice records we process on a wholesaler’s behalf.',
      },
      {
        type: 'term',
        term: 'Register-interest leads',
        text: 'unsuccessful or inactive enquiries are deleted 12 months after the last meaningful contact. This includes emailed submissions and any separately recorded lead details. Where an enquiry becomes a customer relationship, information needed for that relationship is handled under the account and business contact criteria above. Information may be retained longer where needed to meet a specific legal obligation or establish, exercise or defend a legal claim. Marketing and suppression records follow their separate criteria below.',
      },
      {
        type: 'term',
        term: 'Support correspondence',
        text: 'retained while needed to resolve the matter and for an appropriate follow-up period, taking account of the issue and any associated legal claim.',
      },
      {
        type: 'term',
        term: 'Security and activity logs',
        text: 'retained for a limited period based on their operational and security purpose and any ongoing investigation.',
      },
      {
        type: 'term',
        term: 'Marketing records',
        text: 'retained while needed for permitted communications. We may keep minimal suppression records to honour an unsubscribe or objection.',
      },
      {
        type: 'term',
        term: 'Backups',
        text: 'backup copies are retained for a limited period under our backup rotation schedule and then deleted. They are not used for routine business purposes. Deleted information may remain in backups until those copies expire; appropriate controls apply if a backup is restored.',
      },
      {
        type: 'p',
        text: 'When information is no longer needed, we delete it or anonymise it so it no longer identifies individuals.',
      },
    ],
  },
  {
    number: 12,
    title: 'SECURITY',
    blocks: [
      {
        type: 'p',
        text: 'We use appropriate technical and organisational measures to protect personal information against unauthorised access, loss, alteration and disclosure.',
      },
    ],
  },
  {
    number: 13,
    title: 'YOUR RIGHTS AND HOW TO CONTACT US',
    blocks: [
      {
        type: 'p',
        text: 'Subject to the applicable conditions and exceptions, you may have rights to access your personal information, correct inaccuracies, request erasure, restrict processing, and receive or transfer certain information in a portable format. You also have rights and safeguards relating to significant decisions made solely by automated processing.',
      },
      {
        type: 'subheading',
        text: 'YOUR RIGHT TO OBJECT',
      },
      {
        type: 'p',
        text: 'You can object to processing based on legitimate interests on grounds relating to your particular situation. You can object to direct marketing at any time, including associated profiling. We will stop using your information for direct marketing when you object.',
      },
      {
        type: 'p',
        text: 'If we rely on consent, you can withdraw it at any time without affecting the lawfulness of processing before withdrawal. For marketing emails, use the unsubscribe link or email privacy@stocdup.com. We may still send necessary service messages.',
      },
      {
        type: 'p',
        text: 'To exercise your rights, email privacy@stocdup.com. We may request proportionate information to verify your identity. We respond within the time limits required by applicable law, generally one month for rights requests, subject to permitted extensions or other applicable provisions.',
      },
      {
        type: 'p',
        text: 'Where we act as processor, we will assist the relevant wholesaler in responding. Deletion rights are not absolute: records may need to be retained for a legal obligation or another applicable exception. Requests concerning records in Xero may also require action by the Xero account holder.',
      },
      {
        type: 'p',
        text: 'If you have a complaint, contact privacy@stocdup.com. We will acknowledge your complaint within 30 days, investigate without unjustifiable delay and keep you informed of the outcome.',
      },
      {
        type: 'lines',
        lines: [
          'You also have the right to complain to the Information Commissioner’s Office (ICO):',
          'Website: https://ico.org.uk/make-a-complaint/',
          'Helpline: 0303 123 1113',
          'Post: Information Commissioner’s Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF.',
        ],
      },
    ],
  },
  {
    number: 14,
    title: 'CHILDREN',
    blocks: [
      {
        type: 'p',
        text: 'Stocdup is a business service and is not directed at children. If you believe a child’s personal information has been provided inappropriately, contact privacy@stocdup.com so we can assess and address it.',
      },
      {
        type: 'p',
        text: 'Account holders must be at least 18 years old.',
      },
    ],
  },
  {
    number: 15,
    title: 'CHANGES TO THIS NOTICE',
    blocks: [
      {
        type: 'p',
        text: 'We update this notice when our processing changes or when otherwise necessary. The latest revision date appears at the top. Where a change materially affects how we use personal information, we will provide appropriate notice before starting the new processing, where required by law.',
      },
    ],
  },
];
