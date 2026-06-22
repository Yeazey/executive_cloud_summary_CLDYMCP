#!/bin/bash

# Test script for Executive Dashboard Generator
# This script tests the dashboard generation without requiring Bob Shell

set -e

echo "🧪 Testing Executive Dashboard Generator..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from cloudability-executive-dashboard directory"
    exit 1
fi

# Check for required files
echo "✓ Checking project structure..."
required_files=(
    "src/config.mjs"
    "src/data-collector.mjs"
    "src/dashboard-generator.mjs"
    "package.json"
    "README.md"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing required file: $file"
        exit 1
    fi
done
echo "✓ All required files present"
echo ""

# Check Node.js version
echo "✓ Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher (found: $(node -v))"
    exit 1
fi
echo "✓ Node.js $(node -v) detected"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check environment variables
echo "✓ Checking environment..."
if [ -z "$CLOUDABILITY_OPENTOKEN" ]; then
    echo "⚠️  Warning: CLOUDABILITY_OPENTOKEN not set (will use default from config)"
fi
if [ -z "$CLOUDABILITY_ENVIRONMENT_ID" ]; then
    echo "⚠️  Warning: CLOUDABILITY_ENVIRONMENT_ID not set (will use default from config)"
fi
echo ""

# Create output directory
mkdir -p output
echo "✓ Output directory ready"
echo ""

# Run the generator
echo "🚀 Generating dashboard..."
echo ""
node src/dashboard-generator.mjs

echo ""
echo "✅ Test complete!"
echo ""
echo "Dashboard location: $(pwd)/output/executive_dashboard.html"
echo ""
echo "To open the dashboard:"
echo "  open output/executive_dashboard.html"
