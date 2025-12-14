import { determineIntent } from '../app/lib/intent-router'

type TestCase = {
  description: string
  input: string
  expectedNeedsVector: boolean
}

const cases: TestCase[] = [
  {
    description: 'Logic puzzle should not require Vector',
    input: 'Brothers and sisters I have none, but that man’s father is my father’s son. Who is that man?',
    expectedNeedsVector: false,
  },
  {
    description: 'Conceptual explanation should not require Vector',
    input: 'Explain buffer overflow with an analogy a beginner could understand.',
    expectedNeedsVector: false,
  },
  {
    description: 'Introspective architecture question should not require Vector',
    input: "How could Zevy's architecture cause misinformation or amplify bias?",
    expectedNeedsVector: false,
  },
]

async function run() {
  const failures: string[] = []

  for (const testCase of cases) {
    try {
      const intent = determineIntent(testCase.input)
      if (intent.needsVector !== testCase.expectedNeedsVector) {
        failures.push(
          `${testCase.description} | expected needsVector=${testCase.expectedNeedsVector}, got ${intent.needsVector} (reason: ${intent.reason})`
        )
      }
    } catch (error: any) {
      failures.push(`${testCase.description} | threw error: ${error?.message || String(error)}`)
    }
  }

  if (failures.length > 0) {
    console.error('Intent routing tests failed:')
    for (const line of failures) {
      console.error(`- ${line}`)
    }
    process.exitCode = 1
  } else {
    console.log('All intent routing tests passed.')
  }
}

run().catch(error => {
  console.error('Unexpected error running intent routing tests:', error)
  process.exitCode = 1
})
