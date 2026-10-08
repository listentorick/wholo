import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hero } from './Hero';
import { ProblemSection } from './ProblemSection';
import { PressureSection } from './PressureSection';
import { GrowthSection } from './GrowthSection';
import { ProtectSection } from './ProtectSection';
import { OperationsSection } from './OperationsSection';
import { AnyScaleSection } from './AnyScaleSection';
import { ConnectedFlowSection } from './ConnectedFlowSection';
import { UkNativeSection } from './UkNativeSection';
import { PricingSection } from './PricingSection';
import { FounderSection } from './FounderSection';
import { FaqSection } from './FaqSection';
import { RegisterSection } from './RegisterSection';
import {
  ANY_SCALE,
  CONNECTED_FLOW,
  FAQ,
  FOUNDER,
  GROWTH,
  HERO_SHOT_ALT,
  OPERATIONS,
  PRICING,
  PRESSURE,
  PROBLEM,
  PROTECT,
  UK_NATIVE,
} from '@/content';

describe('Hero', () => {
  it('renders one h1 and the primary CTA', () => {
    render(<Hero variant="default" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/sell more/i);
    expect(screen.getByRole('link', { name: 'Register interest' })).toHaveAttribute(
      'href',
      '#register',
    );
  });

  it('shows the product screenshot', () => {
    render(<Hero variant="default" />);
    expect(screen.getByRole('img', { name: HERO_SHOT_ALT })).toBeInTheDocument();
  });

  it('applies the growth message when variant=growth', () => {
    render(<Hero variant="growth" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/find you/i);
  });
});

const CONTENT_SECTIONS: Array<[string, () => React.ReactElement, string]> = [
  ['Problem', ProblemSection, PROBLEM.heading],
  ['Pressure', PressureSection, PRESSURE.heading],
  ['Growth', GrowthSection, GROWTH.heading],
  ['Protect', ProtectSection, PROTECT.heading],
  ['Operations', OperationsSection, OPERATIONS.heading],
  ['AnyScale', AnyScaleSection, ANY_SCALE.heading],
  ['ConnectedFlow', ConnectedFlowSection, CONNECTED_FLOW.heading],
  ['UkNative', UkNativeSection, UK_NATIVE.heading],
  ['Pricing', PricingSection, PRICING.heading],
  ['Founder', FounderSection, FOUNDER.heading],
  ['FAQ', FaqSection, FAQ.heading],
];

describe('content sections', () => {
  it.each(CONTENT_SECTIONS)('%s renders its heading', (_name, Comp, heading) => {
    render(<Comp />);
    expect(
      screen.getByRole('heading', { name: new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }),
    ).toBeInTheDocument();
  });

  it('every content section except pricing ends with a Register interest CTA', () => {
    for (const [name, Comp] of CONTENT_SECTIONS) {
      const { unmount } = render(<Comp />);
      if (name !== 'Pricing') {
        expect(
          screen.getAllByRole('link', { name: 'Register interest' }).length,
        ).toBeGreaterThan(0);
      }
      unmount();
    }
  });
});

describe('ConnectedFlow', () => {
  it('lists all six steps', () => {
    render(<ConnectedFlowSection />);
    for (const step of CONNECTED_FLOW.steps) {
      // step text appears in both the desktop and mobile lists
      expect(screen.getAllByText(step).length).toBeGreaterThan(0);
    }
  });
});

describe('ProblemSection', () => {
  it('lists every problem with its explanation', () => {
    render(<ProblemSection />);
    for (const point of PROBLEM.points) {
      expect(screen.getByText(point.title)).toBeInTheDocument();
      expect(screen.getByText(point.body)).toBeInTheDocument();
    }
  });
});

describe('GrowthSection', () => {
  it('presents the marketplace as the way new customers find a distributor', () => {
    render(<GrowthSection />);
    expect(screen.getByText('The Stocdup marketplace')).toBeInTheDocument();
    expect(screen.queryByText(/not an open marketplace/i)).not.toBeInTheDocument();
  });
});

describe('ProtectSection', () => {
  it('shows the customer health screenshot', () => {
    render(<ProtectSection />);
    expect(screen.getByRole('img', { name: PROTECT.screenshotAlt })).toBeInTheDocument();
  });

  it('renders every card', () => {
    render(<ProtectSection />);
    for (const card of PROTECT.cards) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
    }
  });
});

describe('OperationsSection', () => {
  it('includes automatic invoicing', () => {
    render(<OperationsSection />);
    expect(screen.getByText('Raise invoices automatically')).toBeInTheDocument();
  });
});

describe('GrowthSection', () => {
  it('shows the marketplace screenshot', () => {
    render(<GrowthSection />);
    expect(screen.getByRole('img', { name: GROWTH.screenshotAlt })).toBeInTheDocument();
  });
});

describe('UkNativeSection', () => {
  it('shows the product screenshots with their captions', () => {
    render(<UkNativeSection />);
    for (const shot of UK_NATIVE.shots) {
      expect(screen.getByText(shot.caption)).toBeInTheDocument();
      expect(screen.getByRole('img', { name: shot.image.alt })).toBeInTheDocument();
    }
  });
});

describe('RegisterSection', () => {
  it('renders the form heading and lazy-loads the register form', async () => {
    render(<RegisterSection />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /tell us about your wholesale business/i,
    );
    expect(await screen.findByLabelText(/work email/i)).toBeInTheDocument();
  });
});
