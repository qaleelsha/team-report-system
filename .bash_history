sudo apt update && sudo apt install -y nodejs npm postgresql-client
mkdir team-report-system && cd team-report-system
npm init -y
npm install express pg @aws-sdk/client-s3
nano .env
nano server.js
sudo node server.js
