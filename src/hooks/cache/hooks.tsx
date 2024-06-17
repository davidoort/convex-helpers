// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {
  ConvexProvider,
  OptionalRestArgsOrSkip,
  RequestForQueries,
} from "convex/react";
import { FunctionReference, FunctionReturnType } from "convex/server";
import { useContext, useEffect, useMemo, useState } from "react";
import { ConvexQueryCacheContext } from "./provider";
import { createQueryKey } from "./core";
import { Value } from "convex/values";

/**
 * Load a variable number of reactive Convex queries, utilizing
 * the query cache.
 *
 * `useQueries` is similar to {@link useQuery} but it allows
 * loading multiple queries which can be useful for loading a dynamic number
 * of queries without violating the rules of React hooks.
 *
 * This hook accepts an object whose keys are identifiers for each query and the
 * values are objects of `{ query: FunctionReference, args: Record<string, Value> }`. The
 * `query` is a FunctionReference for the Convex query function to load, and the `args` are
 * the arguments to that function.
 *
 * The hook returns an object that maps each identifier to the result of the query,
 * `undefined` if the query is still loading, or an instance of `Error` if the query
 * threw an exception.
 *
 * For example if you loaded a query like:
 * ```typescript
 * const results = useQueries({
 *   messagesInGeneral: {
 *     query: "listMessages",
 *     args: { channel: "#general" }
 *   }
 * });
 * ```
 * then the result would look like:
 * ```typescript
 * {
 *   messagesInGeneral: [{
 *     channel: "#general",
 *     body: "hello"
 *     _id: ...,
 *     _creationTime: ...
 *   }]
 * }
 * ```
 *
 * This React hook contains internal state that will cause a rerender
 * whenever any of the query results change.
 *
 * Throws an error if not used under {@link ConvexProvider}.
 *
 * @param queries - An object mapping identifiers to objects of
 * `{query: string, args: Record<string, Value> }` describing which query
 * functions to fetch.
 * @returns An object with the same keys as the input. The values are the result
 * of the query function, `undefined` if it's still loading, or an `Error` if
 * it threw an exception.
 *
 * @public
 */
export function useQueries(
  queries: RequestForQueries,
): Record<string, any | undefined | Error> {
  const { registry } = useContext(ConvexQueryCacheContext);
  const results: Record<string, any | undefined | Error> = {};
  const listens: [
    string,
    FunctionReference<"query">,
    Record<string, Value>,
    (v: Value | Error) => void,
  ][] = [];
  const qkeys: string[] = [];
  for (const key of Object.keys(queries)) {
    const query = queries[key].query;
    const args = queries[key].args;
    const queryKey = createQueryKey(query, args);
    const initialValue =
      registry === null || queryKey === undefined
        ? undefined
        : registry.probe(queryKey!);
    const [v, setV] = useState(initialValue);
    results[key] = v;
    listens.push([queryKey, query, args, setV]);
    qkeys.push(queryKey);
  }

  if (registry === null) {
    throw new Error(
      "Could not find `ConvexQueryCacheContext`! This `useQuery` implementation must be used in the React component " +
        "tree under `ConvexQueryCacheProvider`. Did you forget it? ",
    );
  }

  useEffect(
    () => {
      const ids: string[] = [];
      for (const [queryKey, query, args, setV] of listens) {
        if (queryKey === undefined) {
          // No subscriptions.
          return;
        }
        const id = crypto.randomUUID();
        registry.start(id, queryKey, query, args, setV);
        ids.push(id);
      }
      return () => {
        for (const id of ids) {
          registry.end(id);
        }
      };
    },
    // Safe to ignore query and args since queryKey is derived from them
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, qkeys],
  );
  return results;
}

/**
 * Load a reactive query within a React component.
 *
 * This React hook contains internal state that will cause a rerender
 * whenever the query result changes.
 *
 * Throws an error if not used under {@link ConvexProvider} and {@link ConvexQueryCacheProvider}.
 *
 * @param query - a {@link FunctionReference} for the public query to run
 * like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function or the string "skip" if the
 * query should not be loaded.
 * @returns the result of the query. If the query is loading returns `undefined`.
 *
 * @public
 */
export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...queryArgs: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> {
  let skipping = false;
  const args = useMemo(() => queryArgs[0] ?? {}, [queryArgs]);
  const params: RequestForQueries = {};
  // Use queries doesn't support skip.
  if (args !== "skip") {
    params["_default"] = {
      query,
      args,
    };
  }
  const results = useQueries(params);
  return useMemo(() => {
    // This may be undefined either because the upstream
    // value is actually undefined, or because the value
    // was not sent to `useQueries` due to "skip".
    const result = results._default;
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }, [results]);
}
