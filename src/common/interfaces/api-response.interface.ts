/**
 * Interface for standardized API responses
 */
export interface ApiResponse<T = any> {
  /** Indicates if the operation was successful */
  success: boolean;

  /** Human-readable message about the operation result */
  message: string;

  /** The actual data returned by the operation */
  data?: T;

  /** Any validation or business logic errors that occurred */
  errors?: Record<string, any>;

  /** ISO timestamp when the response was generated */
  timestamp: string;

  /** The API endpoint path that was accessed */
  path: string;

  /** HTTP status code (for error responses) */
  statusCode?: number;

  /** Time taken to process the request in milliseconds */
  duration?: string;
}
