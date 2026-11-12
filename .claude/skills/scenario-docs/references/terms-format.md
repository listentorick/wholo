# Terms file

`_terms.md` in the scenarios folder (the leading `_` keeps it from being run as a
scenario). It explains, once for the whole help, every **choice a reader makes** (the
options of a status, a classification, a setting) and every **state a reader sees**
(a status badge, a row status) that the help names. Pages take their explanations from
here, so "Active" means the same thing on every page and is never left unexplained.

The `writing-scenarios` skill writes and extends it from the code. `scenario-docs` reads
it, and may add an entry only from text it saw in the app (see below).

```markdown
# Terms

## Product status
Where: a product's page (Product status card) and the Products list
Kind: choice                       # choice: the reader picks one; state: shown to them
- **Active**: customers can see it in their catalogues and order it. It needs a tax type first.
- **Draft**: only your team can see it; customers can't see or order it. New and imported products start here.
- **Archived**: hidden from customers, like Draft.
Source: src/catalogue/catalogue-service.ts (catalogue shows active products only); src/products/product-service.ts (publish check); UI, product form: "Required before this product can be set to Active."

## Customer status
Where: the Customers list and a customer's page
Kind: state
- **Pending invite**: you've added the customer but haven't made them active yet; they can't order.
- **Active**: …
Source: …
```

Rules:

- **One entry per thing the reader meets**, named as the app labels it ("Product
  status", "Invoice creation"). If the same word means different things on different
  records ("Active" for a product and for a customer), they are separate entries.
- **List every option, not just the one a scenario uses**, so a page can say what the
  alternatives are. One sentence each: what it means for the reader's business (who can
  see it, what happens next), not how it's stored.
- **`Source:` is required**: the code that decides the behaviour, and the UI text if
  the app explains it on screen. Nothing goes in that wasn't found there; an option
  whose effect isn't clear from the code goes in the writing skill's report as an open
  question, with no explanation yet.
- **Leave out the self-explanatory**: buttons that say what they do (Save, Cancel,
  Delete), yes/no switches whose label is the whole meaning.
- **`scenario-docs` may add an entry** only when the app itself explains the options on
  screen (help text under a radio button, a tooltip): it copies that meaning, with
  `Source: UI, <screen>`. Anything else it reports as a missing term.
