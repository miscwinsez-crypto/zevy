import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface AnalyticsEvent {
  id: string;
  user_id: string;
  event_type: string;
  feature: string;
  timestamp: string;
  details?: string;
}

interface FeatureUsage {
  feature: string;
  count: number;
}

interface AnalyticsDashboardProps {
  userId: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ userId }) => {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    axios.get(`${API_URL}/api/analytics/events?user_id=${userId}&limit=20`)
      .then(res => setEvents(res.data.events || []))
      .catch(() => setEvents([]));
    axios.get(`${API_URL}/api/analytics/feature-usage/${userId}`)
      .then(res => setFeatureUsage(res.data.feature_usage || []))
      .catch(() => setFeatureUsage([]))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-semibold text-white mb-2">Feature Usage</h4>
        {featureUsage.length === 0 ? (
          <p className="text-sm text-gray-400">No feature usage data available.</p>
        ) : (
          <ul className="space-y-1">
            {featureUsage.map(fu => (
              <li key={fu.feature} className="flex justify-between p-2 rounded" style={{background:'#1f2937',color:'#e5e7eb'}}>
                <span>{fu.feature}</span>
                <span>{fu.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="font-semibold text-white mb-2">Recent Analytics Events</h4>
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">No analytics events found.</p>
        ) : (
          <ul className="space-y-2">
            {events.map(ev => (
              <li key={ev.id} className="p-3 rounded" style={{background:'#1f2937',color:'#e5e7eb'}}>
                <div className="flex justify-between">
                  <span className="font-semibold">{ev.event_type}</span>
                  <span className="text-xs text-gray-400">{new Date(ev.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-sm mt-1">Feature: <span className="font-semibold">{ev.feature}</span></div>
                {ev.details && <div className="text-xs mt-1 text-gray-400">{ev.details}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// Analytics panel improvements
// Add more detailed usage stats and feature analytics