export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string, code = 'bad_request') => new ApiError(400, code, message);
export const unauthorized = (message = 'Authentication required') => new ApiError(401, 'unauthorized', message);
export const forbidden = () => new ApiError(403, 'forbidden', 'Insufficient permissions');
export const notFound = (resource = 'Resource') => new ApiError(404, 'not_found', `${resource} not found`);
