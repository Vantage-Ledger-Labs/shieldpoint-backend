# Proofs Module Setup Guide

## Overview
This guide explains how to set up and configure the Proofs module, which provides proof history, filtering, pagination, and Stellar blockchain verification tracking.

## Prerequisites
- Node.js 18+
- PostgreSQL 12+
- Docker (optional, for PostgreSQL)

## Installation Steps

### 1. Install Dependencies
```bash
npm install
```

This installs all required packages including:
- `@nestjs/typeorm` - TypeORM NestJS integration
- `typeorm` - ORM for database operations
- `pg` - PostgreSQL driver
- `@nestjs/swagger` - Swagger/OpenAPI documentation
- `@nestjs/jwt` - JWT authentication support

### 2. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Application
NODE_ENV=development
PORT=3001

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=shieldpoint
DB_SSL=false

# Authentication
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRATION=3600

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

**Important**: Change `JWT_SECRET` in production!

### 3. Set Up PostgreSQL Database

#### Option A: Using Docker (Recommended)
```bash
docker run -d \
  --name shieldpoint-db \
  -e POSTGRES_DB=shieldpoint \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:15-alpine
```

#### Option B: Using Local PostgreSQL
```bash
# Create database
createdb shieldpoint

# Or using psql
psql -U postgres -c "CREATE DATABASE shieldpoint;"
```

### 4. Automatic Database Synchronization

The Proof entity is automatically synchronized with the database on application startup when `NODE_ENV=development`.

The application creates:
- `proofs` table with all columns
- Indexes on `user_id`, `created_at`, `status`
- Composite index on `(user_id, created_at DESC)` for optimal performance

### 5. Start the Application

```bash
# Development mode (with auto-reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The application will be available at:
- **API**: http://localhost:3001/api/v1
- **Swagger Docs**: http://localhost:3001/api/docs

## Proofs API Endpoints

### Quick Examples

#### Get User Proofs
```bash
curl -X GET "http://localhost:3001/api/v1/proofs" \
  -H "Authorization: Bearer <token>"
```

#### Get with Pagination
```bash
curl -X GET "http://localhost:3001/api/v1/proofs?page=1&limit=20" \
  -H "Authorization: Bearer <token>"
```

#### Get with Status Filter
```bash
curl -X GET "http://localhost:3001/api/v1/proofs?status=verified" \
  -H "Authorization: Bearer <token>"
```

#### Get with Date Filter
```bash
curl -X GET "http://localhost:3001/api/v1/proofs?fromDate=2024-05-01T00:00:00Z&toDate=2024-05-09T23:59:59Z" \
  -H "Authorization: Bearer <token>"
```

#### Get Single Proof
```bash
curl -X GET "http://localhost:3001/api/v1/proofs/{proofId}" \
  -H "Authorization: Bearer <token>"
```

## Database Indexes

The implementation includes optimized indexes for performance:

```sql
-- Composite index for main query path (user_id, created_at DESC)
CREATE INDEX idx_proofs_user_created ON proofs(user_id, created_at DESC);

-- Single indexes for filtering
CREATE INDEX idx_proofs_user_id ON proofs(user_id);
CREATE INDEX idx_proofs_status ON proofs(status);
CREATE INDEX idx_proofs_created_at ON proofs(created_at DESC);
```

These ensure query responses under 200ms for 10k records.

## Module Architecture

```
ProofsModule
├── ProofsController
│   ├── GET /proofs - List user proofs with pagination/filtering
│   └── GET /proofs/:proofId - Get proof details
├── ProofsService
│   ├── getUserProofs() - Query with pagination/sorting
│   ├── getProofById() - Fetch single proof
│   ├── createProof() - Create new proof record
│   ├── updateProofVerified() - Mark proof as verified
│   └── updateProofFailed() - Mark proof as failed
├── Proof Entity (TypeORM)
├── ProofsDto (Request/Response validation)
└── JwtAuthGuard (Authentication)
```

## Key Features

### ✅ Pagination
- Default: 20 records per page
- Maximum: 100 records per page
- 1-based page numbering

### ✅ Filtering
- By status: `pending`, `verified`, `failed`
- By date range: `fromDate`, `toDate` (ISO 8601)
- Filters can be combined

### ✅ Sorting
- Always by latest first (`createdAt DESC`)
- Not user-configurable to ensure consistent UX

### ✅ Authentication
- JWT Bearer token required
- Users can only access their own proofs
- Token validation on every request

### ✅ Performance
- Composite database index on `(user_id, created_at DESC)`
- Optimized queries targeting <200ms response time
- Supports 10k+ records per user

### ✅ Documentation
- OpenAPI/Swagger spec at `/api/docs`
- Full endpoint documentation
- Interactive testing interface

## Verification Service Integration

The Proofs module is designed to work with the Stellar module for blockchain verification:

```typescript
// In your verification service:
import { ProofsService } from './modules/proofs/proofs.service';

constructor(private proofsService: ProofsService) {}

// Mark proof as verified after successful blockchain submission
await this.proofsService.updateProofVerified(
  proofId,
  transactionHash,
  { submittedAt: new Date() }
);

// Mark proof as failed if verification fails
await this.proofsService.updateProofFailed(
  proofId,
  'Transaction failed: insufficient funds'
);
```

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**: 
- Verify PostgreSQL is running
- Check DB_HOST and DB_PORT in .env
- Ensure database exists: `createdb shieldpoint`

### JWT Token Errors
```
Error: Invalid or expired token
```

**Solution**:
- Verify JWT_SECRET matches token signing key
- Check token has not expired
- Confirm Authorization header format: `Bearer <token>`

### Table Not Created
```
Error: relation "proofs" does not exist
```

**Solution**:
- Restart application to trigger synchronize
- Manually run: `npm run synchronize:db` (if available)
- Or create table manually (see PROOFS_API.md)

## Production Considerations

### 1. Disable Auto-Synchronization
```env
NODE_ENV=production
```

In production, use migrations instead:
```typescript
// Set synchronize: false in typeorm.config.ts
synchronize: false,
```

### 2. Enable SSL for Database
```env
DB_SSL=true
```

### 3. Use Strong JWT Secret
```env
JWT_SECRET=<long-random-string-here>
```

Generate with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Enable Database Backups
```bash
# Regular backup (daily)
pg_dump shieldpoint > backup_$(date +%Y%m%d).sql
```

### 5. Monitor Database Performance
```sql
-- Check index usage
SELECT * FROM pg_stat_user_indexes;

-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('proofs'));

-- Check index efficiency
SELECT * FROM pg_stat_user_tables WHERE relname = 'proofs';
```

## Testing

### Manual API Testing

Use Swagger UI at: http://localhost:3001/api/docs

Or test with curl:

```bash
# Create test token (use your auth endpoint)
TOKEN="your_jwt_token"

# Test list endpoint
curl "http://localhost:3001/api/v1/proofs" \
  -H "Authorization: Bearer $TOKEN"

# Test single proof endpoint
curl "http://localhost:3001/api/v1/proofs/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"

# Test unauthorized access
curl "http://localhost:3001/api/v1/proofs" \
  # (Should return 401)
```

## Security Checklist

- [ ] Change JWT_SECRET for production
- [ ] Enable DB_SSL=true for remote databases
- [ ] Use environment variables for sensitive data
- [ ] Implement rate limiting (recommended)
- [ ] Enable HTTPS in production
- [ ] Set up database backups
- [ ] Monitor for unauthorized access
- [ ] Use strong database passwords
- [ ] Restrict database access to application only
- [ ] Keep dependencies updated

## Resources

- [Proofs API Documentation](./PROOFS_API.md)
- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)
- [JWT Introduction](https://jwt.io/introduction)
- [Stellar Documentation](https://developers.stellar.org)
