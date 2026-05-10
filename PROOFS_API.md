# Proof History API Implementation

## Overview

Complete implementation of proof history endpoints for Shieldpoint with pagination, filtering, sorting, authentication, and Swagger documentation. Optimized for high performance with database indexing.

## Implemented Endpoints

### 1. GET /api/v1/proofs
**Retrieve user's proofs with pagination and filtering**

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (1-indexed) |
| `limit` | number | 20 | Records per page (max 100) |
| `status` | enum | - | Filter by status: `pending`, `verified`, `failed` |
| `fromDate` | string | - | Filter from date (ISO 8601 format) |
| `toDate` | string | - | Filter to date (ISO 8601 format) |

#### Response
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "user-id-123",
      "status": "verified",
      "proofData": "proof-data-content",
      "transactionHash": "abcdef1234567890...",
      "explorer_link": "https://stellar.expert/explorer/testnet/tx/abcdef1234567890...",
      "errorMessage": null,
      "metadata": { "key": "value" },
      "createdAt": "2024-05-09T10:30:00Z",
      "updatedAt": "2024-05-09T10:35:00Z",
      "verifiedAt": "2024-05-09T10:35:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "totalPages": 8
}
```

#### Example Requests

```bash
# Get first 20 proofs
curl -X GET "http://localhost:3001/api/v1/proofs" \
  -H "Authorization: Bearer <token>"

# Get proofs with pagination
curl -X GET "http://localhost:3001/api/v1/proofs?page=2&limit=50" \
  -H "Authorization: Bearer <token>"

# Filter by verified status
curl -X GET "http://localhost:3001/api/v1/proofs?status=verified" \
  -H "Authorization: Bearer <token>"

# Filter by date range (sorted latest first)
curl -X GET "http://localhost:3001/api/v1/proofs?fromDate=2024-01-01T00:00:00Z&toDate=2024-05-09T23:59:59Z" \
  -H "Authorization: Bearer <token>"

# Combine filters
curl -X GET "http://localhost:3001/api/v1/proofs?page=1&limit=20&status=pending&fromDate=2024-05-01T00:00:00Z" \
  -H "Authorization: Bearer <token>"
```

### 2. GET /api/v1/proofs/:proofId
**Retrieve a specific proof with full details**

#### Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `proofId` | string | Proof ID (UUID) |

#### Response
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-id-123",
  "status": "verified",
  "proofData": "proof-data-content",
  "transactionHash": "abcdef1234567890...",
  "explorer_link": "https://stellar.expert/explorer/testnet/tx/abcdef1234567890...",
  "errorMessage": null,
  "metadata": { "key": "value" },
  "createdAt": "2024-05-09T10:30:00Z",
  "updatedAt": "2024-05-09T10:35:00Z",
  "verifiedAt": "2024-05-09T10:35:00Z"
}
```

#### Example Request
```bash
curl -X GET "http://localhost:3001/api/v1/proofs/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <token>"
```

## Security

### Authentication
All endpoints require Bearer token authentication via the `Authorization` header:
```
Authorization: Bearer <JWT_TOKEN>
```

### Authorization
- Users can only access their own proofs
- Each request validates that the requested proof belongs to the authenticated user
- Invalid or expired tokens return 401 Unauthorized

### JWT Token Structure
Expected JWT payload:
```json
{
  "userId": "user-id-123",
  "email": "user@example.com",
  "iat": 1715000000,
  "exp": 1715003600
}
```

## Database Schema

### Proofs Table
```sql
CREATE TABLE proofs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status ENUM('pending', 'verified', 'failed') DEFAULT 'pending',
  proof_data TEXT NOT NULL,
  transaction_hash TEXT,
  metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP
);

-- Composite index for optimal query performance (user_id, created_at DESC)
CREATE INDEX idx_proofs_user_created ON proofs(user_id, created_at DESC);

-- Additional indexes for filtering
CREATE INDEX idx_proofs_user_id ON proofs(user_id);
CREATE INDEX idx_proofs_status ON proofs(status);
CREATE INDEX idx_proofs_created_at ON proofs(created_at DESC);
```

## Performance Optimizations

### Database Indexes
The implementation includes the following indexes for optimal performance:

1. **Composite Index (Primary)**: `(user_id, created_at DESC)`
   - Optimizes the main query path for listing user proofs
   - Supports efficient sorting by creation date
   - Target: <200ms response time for 10k records

2. **Single Index**: `(user_id)`
   - Used for existence checks and lookups by user

3. **Status Index**: `(status)`
   - Enables fast filtering by proof status

4. **Date Index**: `(created_at DESC)`
   - Supports date-based queries and sorting

### Query Optimization
- Uses TypeORM's `findAndCount()` for efficient pagination
- Specifies only needed columns in SELECT
- Limit on page size (max 100 records)
- Database-level sorting (ORDER BY created_at DESC)

### Caching Recommendations
For improved performance with frequently accessed data:
```typescript
// Future enhancement: Redis caching for user proof counts
// Cache invalidation on proof status changes
```

## Sorting

### Default Behavior
- **Sorted by**: `createdAt` (latest first / DESC)
- **Immutable**: Cannot be changed via query parameters
- **Rationale**: Most users want to see recent proofs first

Query results are always ordered with newest proofs first.

## Filtering Features

### Status Filter
Filter proofs by verification status:
- `pending` - Awaiting verification
- `verified` - Successfully verified on blockchain
- `failed` - Verification failed

### Date Range Filter
- `fromDate`: Inclusive start date (ISO 8601)
- `toDate`: Inclusive end date (ISO 8601)
- Both parameters are optional and can be used independently

### Filter Combinations
Filters are combined with AND logic:
```
GET /api/v1/proofs?status=verified&fromDate=2024-05-01T00:00:00Z
```
Returns: Verified proofs created on or after May 1, 2024

## Pagination

### Default Behavior
- Page size: 20 records
- Starting page: 1

### Parameters
- `page`: Page number (must be ≥ 1, default: 1)
- `limit`: Records per page (1-100, default: 20)

### Calculation
```
offset = (page - 1) * limit
totalPages = ceil(total / limit)
```

Example with 150 total records and limit of 20:
- `page=1`: Returns 20 records (0-19), totalPages=8
- `page=2`: Returns 20 records (20-39), totalPages=8
- `page=8`: Returns 10 records (140-149), totalPages=8

## Error Handling

### Status Codes
| Code | Description |
|------|-------------|
| 200 | Successful request |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (missing/invalid token) |
| 404 | Proof not found |
| 500 | Internal server error |

### Error Response Format
```json
{
  "statusCode": 401,
  "message": "Invalid or expired token",
  "timestamp": "2024-05-09T10:30:00Z"
}
```

## Configuration

### Environment Variables
Required for proper operation:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=shieldpoint
DB_SSL=false

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=3600

# Stellar
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# Application
NODE_ENV=development
PORT=3001
```

### Stellar Network Configuration
The `explorer_link` field is generated based on the `STELLAR_NETWORK` setting:

- **testnet**: `https://stellar.expert/explorer/testnet/tx/{hash}`
- **mainnet**: `https://stellar.expert/explorer/mainnet/tx/{hash}`

## File Structure

```
src/
├── config/
│   └── typeorm.config.ts         # TypeORM database configuration
├── modules/proofs/
│   ├── dto/
│   │   ├── index.ts
│   │   └── proofs.dto.ts          # Request/response DTOs
│   ├── entities/
│   │   ├── index.ts
│   │   └── proof.entity.ts        # Proof database entity
│   ├── proofs.controller.ts       # API endpoints
│   ├── proofs.service.ts          # Business logic
│   └── proofs.module.ts           # Module configuration
├── common/guards/
│   └── jwt-auth.guard.ts          # JWT authentication guard
├── app.module.ts                  # Updated with TypeORM
└── main.ts                        # Updated with Swagger
```

## Testing

### Test Proofs
Use these example requests to test the implementation:

```bash
# 1. Get all proofs (requires valid JWT token)
curl -X GET "http://localhost:3001/api/v1/proofs" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 2. Get with pagination
curl -X GET "http://localhost:3001/api/v1/proofs?page=1&limit=10" \
  -H "Authorization: Bearer <token>"

# 3. Get with status filter
curl -X GET "http://localhost:3001/api/v1/proofs?status=verified" \
  -H "Authorization: Bearer <token>"

# 4. Get with date range
curl -X GET "http://localhost:3001/api/v1/proofs?fromDate=2024-05-01T00:00:00Z&toDate=2024-05-09T23:59:59Z" \
  -H "Authorization: Bearer <token>"

# 5. Get single proof
curl -X GET "http://localhost:3001/api/v1/proofs/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <token>"
```

### Invalid Token Test
```bash
# Should return 401 Unauthorized
curl -X GET "http://localhost:3001/api/v1/proofs" \
  -H "Authorization: Bearer invalid-token"
```

### Missing Authorization Header
```bash
# Should return 401 Unauthorized
curl -X GET "http://localhost:3001/api/v1/proofs"
```

## API Documentation

### Swagger/OpenAPI
Access the interactive API documentation at:
```
http://localhost:3001/api/docs
```

The Swagger UI includes:
- All endpoint definitions
- Request/response schemas
- Parameter documentation
- Authorization configuration
- Try-it-out functionality

## Future Enhancements

1. **Caching Layer**
   - Redis cache for frequently accessed proofs
   - Cache invalidation strategies

2. **Export Functionality**
   - CSV/JSON export of proof history
   - Date range exports

3. **Advanced Filtering**
   - Search by proof data content
   - Transaction hash search

4. **Monitoring & Analytics**
   - Proof success/failure rates
   - Performance metrics
   - User activity logging

5. **Batch Operations**
   - Bulk status updates
   - Batch verification

## Notes

- All timestamps are in UTC (ISO 8601 format)
- UUIDs are used for all IDs for distributed system compatibility
- The `explorer_link` is a computed field generated from `transactionHash`
- Maximum page limit is 100 records to prevent OS exhaustion
- Database synchronization is automatic in development mode
