#!/bin/bash

# ============================================================================
# EC2 Setup Script for GroceryVape Morocco Backend
# Run this script on your fresh Ubuntu 22.04 EC2 instance
# ============================================================================

echo "🇲🇦 Setting up GroceryVape Morocco Backend on EC2..."
echo "=================================================="

# Update system packages
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
echo "🛠️ Installing essential packages..."
sudo apt install -y curl wget git vim htop unzip software-properties-common

# ============================================================================
# INSTALL NODE.JS 18 LTS
# ============================================================================
echo "📗 Installing Node.js 18 LTS..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
node_version=$(node --version)
npm_version=$(npm --version)
echo "✅ Node.js installed: $node_version"
echo "✅ npm installed: $npm_version"

# ============================================================================
# INSTALL POSTGRESQL 15
# ============================================================================
echo "🐘 Installing PostgreSQL 15..."
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-15 postgresql-client-15 postgresql-contrib-15

# Install PostGIS for geographic features
sudo apt install -y postgresql-15-postgis-3

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

echo "✅ PostgreSQL 15 installed and started"

# ============================================================================
# CONFIGURE POSTGRESQL
# ============================================================================
echo "🔧 Configuring PostgreSQL..."

# Switch to postgres user and set up database
sudo -u postgres psql << EOF
-- Create database
CREATE DATABASE groceryvape_morocco;

-- Create user with secure password
CREATE USER groceryvape_user WITH ENCRYPTED PASSWORD 'GroceryVape2024!Morocco';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE groceryvape_morocco TO groceryvape_user;

-- Exit
\q
EOF

# Configure PostgreSQL for remote connections (local network only for security)
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/g" /etc/postgresql/15/main/postgresql.conf

# Configure authentication
echo "host    groceryvape_morocco    groceryvape_user    127.0.0.1/32    md5" | sudo tee -a /etc/postgresql/15/main/pg_hba.conf

# Restart PostgreSQL to apply changes
sudo systemctl restart postgresql

echo "✅ PostgreSQL configured for GroceryVape"

# ============================================================================
# INSTALL PM2 (Process Manager)
# ============================================================================
echo "⚡ Installing PM2 process manager..."
sudo npm install -g pm2

# Configure PM2 to start on boot
pm2 startup
# Note: Copy and run the command that PM2 outputs

echo "✅ PM2 installed"

# ============================================================================
# INSTALL NGINX (Reverse Proxy)
# ============================================================================
echo "🌐 Installing Nginx..."
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

echo "✅ Nginx installed and started"

# ============================================================================
# CONFIGURE FIREWALL
# ============================================================================
echo "🔥 Configuring UFW firewall..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw allow 3000  # Node.js app port

echo "✅ Firewall configured"

# ============================================================================
# CREATE APPLICATION DIRECTORY
# ============================================================================
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/groceryvape
sudo chown -R $USER:$USER /var/www/groceryvape
cd /var/www/groceryvape

echo "✅ Application directory created at /var/www/groceryvape"

# ============================================================================
# INSTALL SSL CERTIFICATE (Let's Encrypt) - Optional for later
# ============================================================================
echo "🔒 Installing Certbot for SSL (for future domain setup)..."
sudo apt install -y certbot python3-certbot-nginx

echo "✅ Certbot installed (use later with domain)"

# ============================================================================
# SYSTEM OPTIMIZATION FOR MOROCCO
# ============================================================================
echo "🇲🇦 Optimizing system for Morocco..."

# Set timezone to Morocco
sudo timedatectl set-timezone Africa/Casablanca

# Configure locale for Arabic support
sudo locale-gen ar_MA.UTF-8
sudo locale-gen fr_FR.UTF-8
sudo locale-gen en_US.UTF-8

# Update locale
sudo update-locale

echo "✅ System optimized for Morocco (timezone, locales)"

# ============================================================================
# MONITORING SETUP
# ============================================================================
echo "📊 Setting up basic monitoring..."

# Install htop for system monitoring
sudo apt install -y htop iotop

# Create log directory
sudo mkdir -p /var/log/groceryvape
sudo chown -R $USER:$USER /var/log/groceryvape

echo "✅ Basic monitoring setup complete"

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "🎉 EC2 Setup Complete!"
echo "======================"
echo "✅ Ubuntu 22.04 LTS updated"
echo "✅ Node.js $(node --version) installed"
echo "✅ PostgreSQL 15 installed and configured"
echo "✅ PM2 process manager installed"
echo "✅ Nginx web server installed"
echo "✅ UFW firewall configured"
echo "✅ Application directory: /var/www/groceryvape"
echo "✅ Timezone set to Africa/Casablanca"
echo "✅ Arabic/French locale support enabled"
echo ""
echo "📋 Next Steps:"
echo "1. Upload your backend code to /var/www/groceryvape"
echo "2. Run 'npm install' in the backend directory"
echo "3. Create .env file with database credentials"
echo "4. Run database migrations"
echo "5. Start the application with PM2"
echo ""
echo "🔗 Database Connection Info:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: groceryvape_morocco"
echo "   Username: groceryvape_user"
echo "   Password: GroceryVape2024!Morocco"
echo ""
echo "🌍 Your EC2 Public IP: $(curl -s http://checkip.amazonaws.com)"
echo "📱 Test your API at: http://$(curl -s http://checkip.amazonaws.com):3000"
echo ""
echo "Happy coding! 🚀"