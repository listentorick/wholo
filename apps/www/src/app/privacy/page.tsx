import type { Metadata } from 'next';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/layout/Section';
import { DisplayHeading } from '@/components/ui/DisplayHeading';
import {
  PRIVACY_EMAIL,
  PRIVACY_NOTICE,
  PRIVACY_NOTICE_TITLE,
  PRIVACY_NOTICE_UPDATED,
  type NoticeBlock,
} from './notice';

export const metadata: Metadata = {
  title: 'Privacy notice',
  robots: { index: false, follow: true },
};

const LINK = 'text-primary underline hover:text-primary-hover';
const LINKABLE = new RegExp(`(${PRIVACY_EMAIL.replace('.', '\\.')}|https://\\S+)`);

/** Notice text with the privacy email address and any URLs turned into links. */
function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split(LINKABLE).map((part, i) => {
        if (part === PRIVACY_EMAIL) {
          return (
            <a key={i} href={`mailto:${part}`} className={LINK}>
              {part}
            </a>
          );
        }
        if (part.startsWith('https://')) {
          return (
            <a key={i} href={part} rel="noopener noreferrer" className={`${LINK} break-words`}>
              {part}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}

function Block({ block }: { block: NoticeBlock }) {
  switch (block.type) {
    case 'subheading':
      return <h3 className="pt-2 text-[15px] font-bold tracking-wide text-navy">{block.text}</h3>;
    case 'term':
      return (
        <p>
          <strong className="font-semibold text-foreground">{block.term}:</strong>{' '}
          <Linked text={block.text} />
        </p>
      );
    case 'lines':
      return (
        <p>
          {block.lines.map((line, i) => (
            <span key={i} className="block">
              <Linked text={line} />
            </span>
          ))}
        </p>
      );
    default:
      return (
        <p>
          <Linked text={block.text} />
        </p>
      );
  }
}

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <Section band="white">
          <div className="flex max-w-[680px] flex-col gap-10">
            <div className="flex flex-col gap-5">
              <DisplayHeading as="h1" className="text-navy">
                {PRIVACY_NOTICE_TITLE}
              </DisplayHeading>
              <p className="text-[16px] text-muted">Last updated: {PRIVACY_NOTICE_UPDATED}</p>
            </div>
            {PRIVACY_NOTICE.map((section) => (
              <section
                key={section.number}
                aria-labelledby={`privacy-${section.number}`}
                className="flex flex-col gap-4 text-[16px] text-muted"
              >
                <h2
                  id={`privacy-${section.number}`}
                  className="text-[18px] font-bold tracking-wide text-navy"
                >
                  {section.number}. {section.title}
                </h2>
                {section.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </section>
            ))}
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
