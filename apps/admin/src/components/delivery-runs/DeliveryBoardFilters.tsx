import { SegmentedFilter } from '@/components/list/SegmentedFilter';

export type BoardAttentionFilter = 'all' | 'unassigned' | 'missed';

interface DeliveryBoardFiltersProps {
  filter: BoardAttentionFilter;
  onChange: (filter: BoardAttentionFilter) => void;
}

const OPTIONS: { value: BoardAttentionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned only' },
  { value: 'missed', label: 'Missed only' },
];

// Only affects the List view; Board stays fully visible unconditionally
// (decision #2 in the delivery-planning-pbi-plan decisions log). The
// responsive toggle-group-vs-select behaviour lives in SegmentedFilter,
// shared with the Delivery dashboard's "Needs doing" filter.
export function DeliveryBoardFilters({ filter, onChange }: DeliveryBoardFiltersProps) {
  return <SegmentedFilter ariaLabel="Filter deliveries" value={filter} options={OPTIONS} onChange={onChange} />;
}
