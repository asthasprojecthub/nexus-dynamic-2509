import React from "react";
import MasterVersionPage from "./MasterVersionPage";

// Backward-compatible wrapper. Panel versions now use the same editor as
// Inquiry, Project and Ticket master versions.
export default function PanelVersionPage(props) {
  return <MasterVersionPage type="panel" {...props} />;
}
