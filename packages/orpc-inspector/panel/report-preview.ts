import type { OrpcCall } from '../src/core/types'
import type { ReportOptions } from './report'
import { buildCallReport, buildErrorsReport } from './report'

const example: OrpcCall = {
  id: 'example',
  procedure: 'profile.update',
  side: 'client',
  state: 'invalid',
  startedAt: new Date(2025, 0, 1, 12).getTime(),
  method: 'POST',
  url: 'https://example.test/rpc/profile/update',
  input: { name: 'A', token: 'example-token' },
  issuesOf: 'input',
  issues: [
    {
      path: ['name'],
      code: 'too_small',
      message: 'Name must have at least 2 characters',
    },
  ],
}

export interface ReportPreview {
  source: 'errors' | 'selected' | 'example'
  text: string
}

export function buildReportPreview(
  options: ReportOptions,
  calls: OrpcCall[],
  selected?: OrpcCall,
): ReportPreview {
  if (calls.some(call => call.state === 'error' || call.state === 'invalid')) {
    return {
      source: 'errors',
      text: buildErrorsReport(calls, options),
    }
  }
  if (selected) {
    return {
      source: 'selected',
      text: buildCallReport(selected, options),
    }
  }
  return {
    source: 'example',
    text: buildCallReport(example, options),
  }
}
