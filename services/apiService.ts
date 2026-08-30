/**
 * SkoFy API Service - Frontend Provision for Backend Integration
 * 
 * This service acts as the bridge between the UI and the data layer. 
 * Currently it uses mock data and local logic, but it's structured 
 * to be replaced with fetch/axios calls to the real backend.
 */

import { ProviderJob, FeasibilityResult, checkFeasibility } from './schedulingEngine';

// Generic API Response wrapper
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export const API_BASE_URL = 'https://api.skofy.com/v1'; // Future backend URL

class ApiService {
  /**
   * JOBS & SCHEDULING
   */
  async getAvailableJobs(providerId: string): Promise<any[]> {
    // Current: Returning mock data
    // Future: return fetch(`${API_BASE_URL}/jobs/available?providerId=${providerId}`).then(res => res.json());
    return new Promise((resolve) => {
      setTimeout(() => resolve([]), 500); // Simulate network delay
    });
  }

  async checkJobFeasibility(providerId: string, newJob: any, existingJobs: any[]): Promise<FeasibilityResult> {
    // Current: Local calculation
    // Future: Post to /providers/{id}/feasibility-check
    return new Promise((resolve) => {
      const result = checkFeasibility(newJob, existingJobs);
      setTimeout(() => resolve(result), 300); // Simulate API latency
    });
  }

  /**
   * CHAT SYSTEM
   */
  async sendMessage(chatId: string, message: string): Promise<boolean> {
    // Future: POST /chat/send
    return true;
  }

  /**
   * SERVICE COMPLETION & RATINGS
   */
  async submitJobRating(jobId: string, ratings: any, comment: string): Promise<boolean> {
    // Future: POST /jobs/{jobId}/rate
    console.log('API call: Submitting rating for', jobId, ratings);
    return new Promise((resolve) => setTimeout(() => resolve(true), 800));
  }

  /**
   * PROVIDER STATUS
   */
  async updateAvailability(providerId: string, isAvailable: boolean): Promise<boolean> {
    // Future: PATCH /providers/{id}/status
    return true;
  }

  async updateLiveLocation(providerId: string, lat: number, lng: number): Promise<void> {
    // Future: POST /providers/{id}/location (Webhook or Sockets)
  }
}

export const api = new ApiService();
