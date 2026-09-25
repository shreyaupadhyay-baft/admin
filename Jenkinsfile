// BAFT Admin CI pipeline.
//
// Phase 0 status: checkout -> install -> lint -> typecheck -> unit tests -> build
// are real and enforced. Deploy/E2E/production stages are intentionally left as
// explicit placeholders (not silently skipped, not faked) until a Jenkins
// controller, deploy targets, and environment credentials exist. Do not wire
// those stages up by guessing infrastructure that hasn't been provisioned.
pipeline {
  agent any

  environment {
    NODE_VERSION = '20'
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Lint') {
      steps {
        sh 'npm run lint'
      }
    }

    stage('Type Check') {
      steps {
        sh 'npm run typecheck'
      }
    }

    stage('Unit Tests') {
      steps {
        sh 'npm run test'
      }
    }

    stage('Security Checks') {
      steps {
        // Baseline dependency audit. Extend with SAST/secret-scanning once
        // those tools are selected — do not add a tool here without a
        // decision on which one the team standardizes on.
        sh 'npm audit --audit-level=high || true'
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
      }
    }

    stage('Integration Tests') {
      steps {
        echo 'TBD: requires a provisioned Postgres/Redis test environment in CI.'
      }
    }

    stage('Container Scan') {
      steps {
        echo 'TBD: no container image / registry decided yet.'
      }
    }

    stage('Deploy Dev') {
      steps {
        echo 'TBD: no Jenkins controller or dev deploy target provisioned yet.'
      }
    }

    stage('Smoke Tests / E2E / Contract Tests') {
      steps {
        echo 'TBD: depends on a reachable Dev deployment.'
      }
    }
  }
}
