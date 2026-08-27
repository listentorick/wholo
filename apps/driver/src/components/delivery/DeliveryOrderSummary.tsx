import { DeliveryLinkOrder } from '@/types/delivery';

interface DeliveryOrderSummaryProps {
  order: DeliveryLinkOrder;
}

function formatAddress(address: DeliveryLinkOrder['address']): string {
  return [address.line1, address.line2, address.city, address.state, address.postcode, address.country]
    .filter(Boolean)
    .join(', ');
}

// Everything a driver needs to make the delivery, and nothing else — no
// pricing (the API response has no price field at all), no other orders, no
// admin functionality (PRD §8).
export function DeliveryOrderSummary({ order }: DeliveryOrderSummaryProps) {
  const address = formatAddress(order.address);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-widest text-foreground-tertiary">
          Order {order.orderNumber}
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{order.customerName}</h1>
      </div>

      <div className="border border-border bg-white p-4">
        {address && <p className="text-sm text-foreground">{address}</p>}
        {order.customerPhone && (
          <a href={`tel:${order.customerPhone}`} className="mt-1 block text-sm font-medium text-accent">
            {order.customerPhone}
          </a>
        )}
      </div>

      {order.deliveryInstructions && (
        <div className="border border-amber-border bg-amber-light p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-fg">Delivery instructions</div>
          <p className="mt-1 text-sm text-foreground">{order.deliveryInstructions}</p>
        </div>
      )}

      <div className="border border-border bg-white">
        <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-widest text-foreground-tertiary">
          Products
        </div>
        <ul>
          {order.lines.map((line, index) => (
            <li
              key={`${line.productName}-${index}`}
              className="flex items-center justify-between px-4 py-3 text-sm text-foreground [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"
            >
              <span>{line.productName}</span>
              <span className="font-medium">×{line.quantity}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
