#!/bin/bash

# 🔒 Local Security Scan Script
# Run security scans locally before pushing to GitHub

set -e

echo "🔒 Starting local security scans..."
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
SCAN_PASSED=0
SCAN_FAILED=0

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2 passed${NC}"
        SCAN_PASSED=$((SCAN_PASSED + 1))
    else
        echo -e "${RED}❌ $2 failed${NC}"
        SCAN_FAILED=$((SCAN_FAILED + 1))
    fi
}

# Check if tools are installed
check_tool() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 is installed"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $1 is not installed. Install it with: $2"
        return 1
    fi
}

echo ""
echo "📋 Checking required tools..."
echo "======================================"

# Check for required tools
TOOLS_OK=true
check_tool "npm" "Download from https://nodejs.org" || TOOLS_OK=false
check_tool "docker" "Download from https://docker.com" || TOOLS_OK=false

# Optional tools
check_tool "snyk" "npm install -g snyk" || echo "  (Optional: for dependency scanning)"
check_tool "trivy" "Install from https://github.com/aquasecurity/trivy" || echo "  (Optional: for container scanning)"

if [ "$TOOLS_OK" = false ]; then
    echo -e "${RED}Please install required tools before running scans${NC}"
    exit 1
fi

echo ""
echo "======================================"
echo "🔍 Starting security scans..."
echo "======================================"

# 1. NPM Audit
echo ""
echo "1️⃣ Running npm audit..."
if npm audit --audit-level=moderate; then
    print_status 0 "NPM Audit"
else
    print_status 1 "NPM Audit"
    echo "   Run: npm audit fix"
fi

# 2. Snyk Test (if available)
echo ""
echo "2️⃣ Running Snyk dependency scan..."
if command -v snyk &> /dev/null; then
    if [ -z "$SNYK_TOKEN" ]; then
        echo -e "${YELLOW}⚠ SNYK_TOKEN not set. Run: snyk auth${NC}"
        echo "   Skipping Snyk scan..."
    else
        if snyk test --severity-threshold=high; then
            print_status 0 "Snyk Scan"
        else
            print_status 1 "Snyk Scan"
            echo "   Review vulnerabilities and update dependencies"
        fi
    fi
else
    echo "   Skipping (snyk not installed)"
fi

# 3. GitGuardian / Git Secrets Scan
echo ""
echo "3️⃣ Scanning for secrets..."
if command -v ggshield &> /dev/null; then
    if ggshield secret scan path .; then
        print_status 0 "Secrets Scan"
    else
        print_status 1 "Secrets Scan"
        echo "   Found secrets in code! Remove them immediately"
    fi
else
    echo "   Using basic pattern matching..."
    # Basic secret pattern check
    if grep -r -E "(password|secret|key|token)\s*=\s*['\"][^'\"]{8,}" --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" . > /dev/null; then
        print_status 1 "Basic Secret Scan"
        echo "   Possible secrets found! Review your code"
    else
        print_status 0 "Basic Secret Scan"
    fi
fi

# 4. ESLint
echo ""
echo "4️⃣ Running ESLint..."
if npm run lint; then
    print_status 0 "ESLint"
else
    print_status 1 "ESLint"
    echo "   Run: npm run lint -- --fix"
fi

# 5. Prettier
echo ""
echo "5️⃣ Running Prettier check..."
if npx prettier --check "src/**/*.ts" 2>/dev/null || npx prettier --check "**/*.{js,ts,tsx,json}" 2>/dev/null; then
    print_status 0 "Prettier"
else
    print_status 1 "Prettier"
    echo "   Run: npx prettier --write ."
fi

# 6. TypeScript Check
echo ""
echo "6️⃣ Running TypeScript check..."
if npx tsc --noEmit; then
    print_status 0 "TypeScript"
else
    print_status 1 "TypeScript"
    echo "   Fix TypeScript errors before committing"
fi

# 7. Docker Build & Trivy Scan
echo ""
echo "7️⃣ Building Docker image..."
if [ -f "Dockerfile" ]; then
    if docker build -t security-scan-test:local .; then
        print_status 0 "Docker Build"
        
        # Run Trivy if available
        if command -v trivy &> /dev/null; then
            echo ""
            echo "8️⃣ Running Trivy container scan..."
            if trivy image --severity HIGH,CRITICAL security-scan-test:local; then
                print_status 0 "Trivy Scan"
            else
                print_status 1 "Trivy Scan"
                echo "   Review and fix container vulnerabilities"
            fi
        else
            echo "   Skipping Trivy scan (not installed)"
        fi
        
        # Cleanup
        docker rmi security-scan-test:local 2>/dev/null || true
    else
        print_status 1 "Docker Build"
        echo "   Fix Dockerfile errors"
    fi
else
    echo "   No Dockerfile found, skipping..."
fi

# Summary
echo ""
echo "======================================"
echo "📊 Security Scan Summary"
echo "======================================"
echo -e "${GREEN}✅ Passed: $SCAN_PASSED${NC}"
echo -e "${RED}❌ Failed: $SCAN_FAILED${NC}"
echo ""

if [ $SCAN_FAILED -gt 0 ]; then
    echo -e "${RED}⚠️  Please fix the issues above before pushing!${NC}"
    exit 1
else
    echo -e "${GREEN}🎉 All security scans passed! Safe to push.${NC}"
    exit 0
fi
