/**
 * @file ErrorBoundary.jsx
 * @description App-wide error boundary.
 *
 * A render-time exception anywhere in the tree would otherwise unmount the
 * whole app and leave a blank white screen. This catches it and shows a small
 * recovery screen with a reload button, so one bad component can't take the
 * entire dashboard down for the user.
 *
 * (React error boundaries must be class components — there is no hook
 * equivalent for componentDidCatch.)
 */

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Surface in the console for debugging; no external logging at this scale.
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <h1 className="font-sans font-bold text-lg text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-sm font-body text-gray-500 mb-6">
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary justify-center">
            Reload
          </button>
        </div>
      </div>
    )
  }
}
