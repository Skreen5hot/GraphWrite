/**
 * ValidationPanel (task 2.10)
 *
 * SPEC refs: section 17.5, section 5.13, FR-U028.
 * Implementation: IMPLEMENTATION_PLAN.md section 2.10.
 *
 * Renders ValidationReport findings in the bottom outputs panel.
 * Supports acknowledgement of warning and info findings per SPEC section 17.5.
 * Error findings have no acknowledge affordance per SPEC section 17.1.
 * Layer boundary: imports types from src/validate/ (stable module); no
 * imports from src/adapters/ or src/composition/.
 */

import type { ValidationFinding } from "../validate/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityKey(severity: string): "error" | "warning" | "info" {
  if (severity === "ecm:error") return "error";
  if (severity === "ecm:warning") return "warning";
  return "info";
}

function severityLabel(severity: string): string {
  if (severity === "ecm:error") return "error";
  if (severity === "ecm:warning") return "warning";
  return "info";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ValidationPanelProps {
  findings: ValidationFinding[];
  onAcknowledge: (code: string, target: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ValidationPanel({
  findings,
  onAcknowledge,
}: ValidationPanelProps) {
  if (findings.length === 0) {
    return (
      <div className="gw-validation-panel" data-testid="gw-validation-panel">
        <p className="gw-validation-empty">No validation issues.</p>
      </div>
    );
  }

  return (
    <div className="gw-validation-panel" data-testid="gw-validation-panel">
      <ul className="gw-finding-list" data-testid="gw-finding-list">
        {findings.map((finding) => {
          const sev = finding["ecm:severity"];
          const code = finding["ecm:code"];
          const target = finding["ecm:target"];
          const acked = finding["ecm:acknowledged"];
          const canAck = sev !== "ecm:error";
          return (
            <li
              key={`${code}::${target}`}
              className={`gw-finding-item${acked ? " gw-finding-acknowledged" : ""}`}
              data-testid="gw-finding-item"
              data-severity={sev}
              data-code={code}
            >
              <span
                className={`gw-severity-badge gw-severity-badge--${severityKey(sev)}`}
                data-testid="gw-severity-badge"
                data-severity={sev}
              >
                {severityLabel(sev)}
              </span>
              <span className="gw-finding-code">{code}</span>
              <span className="gw-finding-message">{finding["ecm:message"]}</span>
              <span className="gw-finding-target" title={target}>
                {target}
              </span>
              {canAck && (
                <button
                  className={`gw-btn-acknowledge${acked ? " gw-btn-acknowledge--done" : ""}`}
                  data-testid="gw-btn-acknowledge"
                  onClick={() => {
                    onAcknowledge(code, target);
                  }}
                  disabled={acked}
                  aria-pressed={acked}
                >
                  {acked ? "Acknowledged" : "Acknowledge"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
