import { useState, useEffect, useCallback } from "react";
import { dlqService, DLQMessage, DLQMetrics } from "@/services/deadLetterQueue";

export function useDeadLetterQueue(limit = 100) {
  const [messages, setMessages] = useState<DLQMessage[]>([]);
  const [metrics, setMetrics] = useState<DLQMetrics>({
    totalEnqueued: 0,
    totalDequeued: 0,
    totalRequeued: 0,
    totalRemoved: 0,
    currentSize: 0,
  });

  const updateState = useCallback(() => {
    setMessages(dlqService.peek(limit));
    setMetrics(dlqService.getMetrics());
  }, [limit]);

  useEffect(() => {
    updateState();
    const unsubscribe = dlqService.subscribe(updateState);
    return () => {
      unsubscribe();
    };
  }, [updateState]);

  const removeMessage = useCallback((id: string) => {
    dlqService.remove(id);
  }, []);

  const clearAll = useCallback(() => {
    const currentMessages = dlqService.peek(dlqService.getMetrics().currentSize);
    currentMessages.forEach(msg => dlqService.remove(msg.id));
  }, []);

  return {
    messages,
    metrics,
    removeMessage,
    clearAll,
  };
}
