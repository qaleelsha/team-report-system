# Multi-Team Report Processing Platform

A secure, scalable, and automated cloud-native backend infrastructure built on AWS to manage, track, and process multi-team report files. This platform leverages a relational database design for strong consistency and serverless automation for periodic background file processing.

---

## System Architecture

The application implements a production-grade decoupled architecture on AWS:
* **Compute Tier:** Node.js Web API deployed on an AWS EC2 instance behind an Application Load Balancer (ALB) to handle incoming traffic on port 80.
* **Storage Tier:** Relational tracking managed via Amazon RDS PostgreSQL; raw report document uploads stored within a structured Amazon S3 bucket hierarchy.
* **Automation Tier:** Decoupled serverless background processing via an AWS Lambda function invoked periodically by an Amazon EventBridge scheduled cron job.
* **Security Profile:** IAM Instance Profiles and Service Roles are utilized to ensure secure, passwordless credential management across AWS infrastructure components.

---

## Database Schema Design

The relational tracking layer is built on PostgreSQL with strict referential constraints, sequential primary keys, and automated cascading cleanup policies.

```sql
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL
);

CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    team_name VARCHAR(100) NOT NULL
);

CREATE TABLE employee_teams (
    employee_id INT REFERENCES employees (id) ON DELETE CASCADE,
    team_id INT REFERENCES teams (id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (employee_id, team_id)
);

CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    team_id INT REFERENCES teams (id) ON DELETE CASCADE,
    uploaded_by INT REFERENCES employees (id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

S3 Storage Structure
The object storage layer isolates file ingestion and outputs strictly by team IDs and execution states:
team-report-storage/
├── team-1/
│   ├── pending/
│   └── processed/
└── team-2/
    ├── pending/
    └── processed/

API Endpoint Reference

Employee Operations
POST /employees - Register a new employee record.
GET /employees - Retrieve all registered employee records.

Team Operations
POST /teams - Establish a new operational group.
GET /teams - List all established operational groups.

Mapping & Relational Queries
POST /teams/:teamId/employees/:employeeId - Associate an employee to a specific team.
GET /teams/:teamId/employees - Retrieve all employees mapped to a team using a relational internal JOIN query.
GET /employees/:employeeId/teams - Reverse look up teams assigned to a specific employee.

Report Metrics & Ingestion
POST /upload-report - Uploads document payloads to the S3 pending/ directory and logs transactional metadata to RDS.
GET /reports - Compiles real-time data analytical summaries showing total files submitted per team using an analytical LEFT JOIN and GROUP BY aggregation query.
GET /teams/:teamId/reports - Fetch metadata logs for reports linked to a specific team ID.

Automated Processing Logic
The background worker is hosted on AWS Lambda and acts as a stateless compute engine. Upon invocation by Amazon EventBridge, it executes the following transactional pipeline:

Scan: Queries the PostgreSQL metadata table to capture all records flagged with a pending status.
Fetch: Streams down the source object content from the S3 pending/ prefix folder.
Analyze: Quantifies metrics (such as compiling total structured line inputs) and updates internal cloud logs.
Transfer: Copies the object payload to the target processed/ prefix folder and purges the source file from pending/.
Commit: Commits a relational database update modifying the status flag to processed and logs a final timestamp execution value (processed_at). 
