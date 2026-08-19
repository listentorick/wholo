import type { DeliveryCard as DeliveryCardType } from '@wholo/types';
import { DeliveryCard } from './DeliveryCard';
import { totalsCopy } from './attention';

interface UnassignedColumnProps {
  cards: DeliveryCardType[];
}

export function UnassignedColumn({ cards }: UnassignedColumnProps) {
  const itemCount = cards.reduce((sum, c) => sum + c.itemCount, 0);

  return (
    <div className="flex h-full w-[300px] shrink-0 min-h-0 flex-col rounded-lg border border-dashed border-border bg-[#fafafa]">
      <header className="border-b border-border p-3">
        <h3 className="text-sm font-semibold text-text">Unassigned</h3>
      </header>
      <div className="flex-1 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted">Everything&rsquo;s assigned</p>
        ) : (
          <div className="space-y-2">
            {cards.map((card) => (
              <DeliveryCard key={card.orderId} card={card} />
            ))}
          </div>
        )}
      </div>
      <footer className="border-t border-border px-3 py-2 text-xs text-muted">
        {totalsCopy(cards.length, itemCount)}
      </footer>
    </div>
  );
}
