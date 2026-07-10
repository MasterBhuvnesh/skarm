"use client";

import { IntegrationsManager } from "@/components/settings/integrations-manager";

/**
 * Integrations settings: connect GitHub, manage the webhook secret, and
 * enable/disable event processing.
 */
export default function IntegrationsSettingsPage() {
  return <IntegrationsManager />;
}
