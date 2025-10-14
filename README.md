# Ethereum Validator Consolidation Monitor

## 1. Project Overview

This project is a real-time monitoring system designed to track validator consolidation events on the Ethereum Beacon Chain, as specified by EIP-7251 for the Pectra upgrade. The system detects new consolidation requests, logs them for historical analysis, and provides a live view of the pending consolidation queue.

---

## 2. Live Endpoints

- **API Base URL:** `https://luganodetask22bce2975.up.railway.app`
- **API Live Status (Health Check):** `https://luganodetask22bce2975.up.railway.app/health`
- **Grafana Dashboard:** `https://kumayllokhandwala04.grafana.net/dashboard/snapshot/RQalVXMFRaBEqiXxPwomQvMsztCJmKio`
- **Demonstration Video:** `https://youtu.be/r0XcC9snMLI`

---

## 3. System Architecture

The application is architected as a distributed system composed of two primary services, ensuring a clear separation of concerns between data collection and data presentation.

1.  **Background Worker (`monitor.ts`):** A persistent, long-running service responsible for data ingestion. It polls the Ethereum Beacon Chain at a regular interval (12 seconds) to fetch new blocks. The service parses block data to identify `bls_to_execution_changes` events, which can signal validator consolidations. Detected events are then written to a PostgreSQL database for permanent storage. The worker also persists its own state to the database, allowing it to resume from the last processed block in the event of a restart, thereby ensuring data integrity.

2.  **Web Service (`server.ts`):** A public-facing REST API built with Express.js. This service provides endpoints for querying system status, historical data, and live queue statistics. For real-time queue data, the API queries the Beacon Chain directly. It also exposes a `/metrics` endpoint in Prometheus format for external observability tools like Grafana.

### Data Flow Diagram

![System Data Flow Diagram](./assets/data-flow-diagram.png)

## 4. Features Implemented

- **Real-Time Event Detection:** Monitors the Beacon Chain for new blocks and parses them for consolidation-related events.
- **Resilient State Management:** The monitor service persists its last processed slot to the database, enabling a seamless resume after restarts and preventing missed blocks.
- **Historical Data Persistence:** All detected events are stored in a PostgreSQL database, indexed for efficient querying.
- **Live Queue Analysis:** The API provides real-time queue length and estimated wait times by directly querying the Beacon Chain's state.
- **Comprehensive REST API:** A full suite of endpoints for system health, metrics, active queue data, and historical validator activity.
- **Observability & Metrics:** Key application metrics (e.g., events detected, queue length, API fetch rates) are exposed in Prometheus format for visualization and alerting.
- **Reliability:** The monitor implements an API retry mechanism to handle transient network failures when communicating with the Beacon node.
- **Structured Logging:** All services use structured JSON logging (`pino`) with appropriate log levels to facilitate efficient debugging and monitoring.

---

## 5. API Documentation

| Method | Endpoint                  | Description                                                                                                      |
| :----- | :------------------------ | :--------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`                 | Provides the operational status of the API, database connectivity, and the monitor's current block height.       |
| `GET`  | `/metrics`                | Exposes application and system metrics in a structured JSON format, suitable for Grafana's JSON API data source. |
| `GET`  | `/consolidations/active`  | Fetches the current list of pending consolidations directly from the Beacon Chain for real-time accuracy.        |
| `GET`  | `/queue/stats`            | Returns live statistics for the pending consolidation queue, including its length and estimated wait time.       |
| `GET`  | `/validators/:id/history` | Retrieves the historical event log for a specific validator index from the PostgreSQL database.                  |

---

## 6. Technology Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Deployment:** Railway (utilizing both Web Service and Background Worker instance types)
- **Observability:** Grafana (via Grafana Cloud), `prom-client`, `pino`

---

## 7. External Services

This project relies on the public **Ethereum Beacon Chain API** to fetch real-time blockchain data. All API interactions are directed to the URL specified in the `BEACON_NODE_URL` environment variable.

- **`GET /eth/v2/beacon/blocks/head`**

  - **Usage:** Polled by the `Background Worker` (`monitor.ts`) every 12 seconds.
  - **Purpose:** To fetch the latest sealed block and scan it for `bls_to_execution_changes` events, which indicate validator consolidations.

- **`GET /eth/v1/beacon/states/head/pending_consolidations`**
  - **Usage:** Queried by the `Web Service` (`server.ts`) for the `/consolidations/active` and `/queue/stats` endpoints.
  - **Purpose:** To retrieve the current list of pending consolidation requests directly from the chain's state for live queue analysis.

---

## 8. Future Considerations

- **Data Archiving Strategy:** For long-term operation, a data lifecycle policy would be implemented. A periodic job would migrate historical event data older than a defined threshold (e.g., 12 months) from the primary database to a cost-effective cold storage solution, such as AWS S3 Glacier, while maintaining queryability.
- **Enhanced Alerting Integration:** The existing alerting rules in Grafana would be integrated with a dedicated incident response platform (e.g., PagerDuty, Opsgenie) to provide automated, tiered notifications for critical system alerts, such as a significant monitor lag or a surge in API failures.

## 9. How to Run Locally

### Prerequisites

- Node.js (v18 or later)
- npm
- A running PostgreSQL database instance
- `pm2` installed globally (`npm install -g pm2`)

### Step-by-Step Instructions

1.  **Clone the Repository**

    ```bash
    git clone [https://github.com/your-username/your-repo-name.git](https://github.com/your-username/your-repo-name.git)
    cd your-repo-name
    ```

2.  **Install Dependencies**

    ```bash
    npm install
    ```

3.  **Set Up Environment Variables**

    - Create a file named `.env` in the root of the project.
    - Copy the contents of `.env.example` (or the block below) into it.
    - Fill in the values for your local database and your Beacon Chain API provider.

    **.env file template:**

    ```
    DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
    BEACON_NODE_URL="https://your-beacon-chain-api-provider-url"
    ```

4.  **Sync the Database Schema**

    - This command reads your `prisma/schema.prisma` file and creates the necessary tables in your database.

    ```bash
    npx prisma db push
    ```

5.  **Build the Project**

    - This compiles the TypeScript source code into JavaScript in the `/dist` directory.

    ```bash
    npm run build
    ```

6.  **Run the Application with `pm2`**

    - The following commands will start both the API server and the background monitor worker. `pm2` will manage them in the background.

    ```bash
    # Start the API server
    pm2 start dist/server.js --name "api-server"

    # Start the monitor worker
    pm2 start dist/monitor.js --name "monitor-worker"
    ```

### Verifying the Setup

- To check the status of your running services, use:
  ```bash
  pm2 list
  ```
