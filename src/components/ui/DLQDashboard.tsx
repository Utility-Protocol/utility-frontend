import React, { useState } from "react";
import { useDeadLetterQueue } from "@/hooks/useDeadLetterQueue";
import { DLQMessage } from "@/services/deadLetterQueue";

export const DLQDashboard: React.FC = () => {
  const { messages, metrics, removeMessage, clearAll } = useDeadLetterQueue(50);
  const [selectedMessage, setSelectedMessage] = useState<DLQMessage | null>(null);

  const formatTime = (ts: number) => new Date(ts).toLocaleString();

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ margin: 0 }}>Dead Letter Queue Dashboard</h1>
        <button 
          onClick={clearAll}
          style={{ padding: "8px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          Clear All
        </button>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        <div style={{ background: "#f3f4f6", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#6b7280" }}>Current Size</h3>
          <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>{metrics.currentSize}</p>
        </div>
        <div style={{ background: "#f3f4f6", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#6b7280" }}>Total Enqueued</h3>
          <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>{metrics.totalEnqueued}</p>
        </div>
        <div style={{ background: "#f3f4f6", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#6b7280" }}>Total Dequeued/Removed</h3>
          <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>{metrics.totalDequeued + metrics.totalRemoved}</p>
        </div>
      </section>

      <div style={{ display: "flex", gap: "24px" }}>
        <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                <th style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>Source</th>
                <th style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>Error</th>
                <th style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>Timestamp</th>
                <th style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}>
                    No messages in DLQ.
                  </td>
                </tr>
              ) : (
                messages.map((msg) => (
                  <tr key={msg.id} style={{ borderBottom: "1px solid #e5e7eb", cursor: "pointer" }} onClick={() => setSelectedMessage(msg)}>
                    <td style={{ padding: "12px 16px" }}>{msg.source}</td>
                    <td style={{ padding: "12px 16px", color: "#ef4444", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {msg.error || "Unknown Error"}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: "14px" }}>{formatTime(msg.timestamp)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeMessage(msg.id); }}
                        style={{ padding: "4px 8px", background: "transparent", border: "1px solid #ef4444", color: "#ef4444", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedMessage && (
          <aside style={{ width: "350px", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px", background: "#f9fafb", alignSelf: "flex-start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "18px" }}>Message Details</h2>
              <button onClick={() => setSelectedMessage(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "20px" }}>&times;</button>
            </div>
            
            <div style={{ marginBottom: "12px" }}>
              <strong style={{ display: "block", fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>ID</strong>
              <code style={{ fontSize: "12px", background: "#e5e7eb", padding: "2px 4px", borderRadius: "4px" }}>{selectedMessage.id}</code>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <strong style={{ display: "block", fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Source</strong>
              <div>{selectedMessage.source}</div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <strong style={{ display: "block", fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Error</strong>
              <div style={{ color: "#ef4444", background: "#fef2f2", padding: "8px", borderRadius: "4px", fontSize: "14px" }}>
                {selectedMessage.error || "None"}
              </div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <strong style={{ display: "block", fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Payload</strong>
              <pre style={{ margin: 0, background: "#1f2937", color: "#f3f4f6", padding: "12px", borderRadius: "4px", overflowX: "auto", fontSize: "12px" }}>
                {JSON.stringify(selectedMessage.payload, null, 2)}
              </pre>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
