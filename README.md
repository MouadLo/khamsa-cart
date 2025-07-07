# 🪬 Khamsa Cart - Morocco's Blessed Marketplace

*"Where tradition meets innovation, and every delivery is blessed"*

A comprehensive e-commerce platform for grocery and lifestyle products in Morocco, featuring Cash on Delivery (COD) and modern payment systems. Named after the traditional Hand of Fatima (Khamsa), symbolizing protection and prosperity for every order.

## 🏗️ Architecture Overview

```
GroceryVapeApp/
├── 📱 mobile/          # React Native customer app (Expo)
├── 🖥️ admin/           # Web admin interface (Next.js)
├── ☁️ backend/         # AWS serverless infrastructure
├── 📦 shared/          # Common types and utilities
├── 📚 docs/            # Documentation
├── 🧪 tests/           # Test suites
└── 🚀 deployment/     # Deployment configurations
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- AWS CLI configured
- Expo CLI
- React Native development environment

### Development Setup
```bash
# Install dependencies
npm install

# Start mobile app
cd mobile && npm start

# Start admin interface  
cd admin && npm run dev

# Deploy backend
cd backend && npm run deploy
```

## 🇲🇦 Morocco Market Features

### Payment Methods
- **Cash on Delivery (COD)** - Primary payment method (85% of customers)
- **Credit/Debit Cards** - Secondary payment method via Stripe
- **Moroccan Dirham (MAD)** currency support

### Localization
- **Arabic** - Primary language (RTL support)
- **French** - Secondary language  
- **English** - Fallback language

### Compliance
- Age verification for vape products
- Morocco delivery regulations
- Local business compliance

## 📱 Mobile App (React Native + Expo)

Customer-facing mobile application with:
- Product catalog (groceries + vape)
- Shopping cart with offline support
- COD and card payment options
- Order tracking
- Arabic/French localization

## 🖥️ Admin Interface (Next.js)

Business management web application with:
- Product management
- Order processing
- COD cash reconciliation
- Customer management
- Analytics dashboard

## ☁️ Backend (AWS Serverless)

Scalable serverless infrastructure:
- **API Gateway** - RESTful API endpoints
- **Lambda** - Business logic functions
- **DynamoDB** - NoSQL database
- **S3** - File storage
- **SNS/SES** - Notifications

## 🗃️ Database Schema

### Products
- Product catalog with categories
- Inventory management
- Multi-language support
- Price in MAD

### Orders
- Order lifecycle management
- COD payment tracking
- Delivery status updates
- Customer information

### COD Management
- Cash collection tracking
- Driver wallet management
- Reconciliation reports
- Verification codes

## 🧪 Testing Strategy

- **Unit Tests** - Individual component testing
- **Integration Tests** - API and service testing
- **E2E Tests** - Full user journey testing
- **Mobile Testing** - React Native component testing

## 🚀 Deployment

### Environments
- **Development** - Local development
- **Staging** - Pre-production testing
- **Production** - Live Morocco deployment

### CI/CD Pipeline
- Automated testing
- Infrastructure deployment
- Mobile app builds
- Admin interface deployment

## 📊 Business Metrics

### Key Performance Indicators
- Order conversion rate
- COD success rate
- Average order value (MAD)
- Customer acquisition cost
- Delivery time performance

## 🔐 Security

- JWT authentication
- Data encryption at rest
- HTTPS/TLS encryption
- Age verification compliance
- Cash handling protocols

## 🌍 Morocco Specific

### Delivery Zones
- Casablanca metropolitan area
- Rabat-Salé region
- Marrakech city
- Expandable to other cities

### Local Partnerships
- Local delivery services
- Moroccan suppliers
- Payment processors
- Compliance consultants

## 📞 Support

For technical support or business inquiries:
- Email: support@groceryvape.ma
- Phone: +212 XXX-XXXX
- Documentation: [docs/](./docs/)

---

**Built for Morocco's growing e-commerce market with Cash on Delivery at its core.**