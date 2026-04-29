import { EventEmitter } from "node:events";

export type TemplateChangeEvent = {
  type: "published" | "updated" | "unpublished";
  templateId: string;
  at: string;
};

type Bus = { emitter: EventEmitter };

const globalForBus = globalThis as unknown as { __fybTemplateBus?: Bus };

function getBus(): Bus {
  if (!globalForBus.__fybTemplateBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalForBus.__fybTemplateBus = { emitter };
  }
  return globalForBus.__fybTemplateBus;
}

export const TEMPLATE_CHANGE_EVENT = "templates:changed";

export function emitTemplateChange(event: TemplateChangeEvent): void {
  getBus().emitter.emit(TEMPLATE_CHANGE_EVENT, event);
}

export function onTemplateChange(
  listener: (event: TemplateChangeEvent) => void
): () => void {
  const { emitter } = getBus();
  emitter.on(TEMPLATE_CHANGE_EVENT, listener);
  return () => {
    emitter.off(TEMPLATE_CHANGE_EVENT, listener);
  };
}
