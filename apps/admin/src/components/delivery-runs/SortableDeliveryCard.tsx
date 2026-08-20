import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DeliveryCard as DeliveryCardType, DeliveryRunColumn } from '@wholo/types';
import { DeliveryCard } from './DeliveryCard';

interface SortableDeliveryCardProps {
  card: DeliveryCardType;
  columnId: string;
  currentRunId: string | null;
  runs: DeliveryRunColumn[];
  isFirst?: boolean;
  isLast?: boolean;
  pending?: boolean;
  locked?: boolean;
  onMove: (targetRunId: string | null) => void;
  onMoveUpDown?: (direction: 'up' | 'down') => void;
}

// Carries the dnd-kit sortable wiring so DeliveryCard itself never imports
// dnd-kit — that's what lets DragOverlay render a second, plain (non-
// sortable) copy of the same component without id collisions.
export function SortableDeliveryCard({
  card, columnId, ...cardProps
}: SortableDeliveryCardProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: card.orderId,
    data: { type: 'card', columnId },
    disabled: cardProps.locked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <DeliveryCard
        card={card}
        {...cardProps}
        dragHandle={(
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag to move ${card.customerName}`}
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted hover:text-text active:cursor-grabbing"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
            </svg>
          </button>
        )}
      />
    </div>
  );
}
