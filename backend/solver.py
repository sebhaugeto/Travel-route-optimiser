"""Open TSP solver using Google OR-Tools with guided local search."""

import numpy as np
from ortools.constraint_solver import routing_enums_pb2, pywrapcp


def solve_tsp(
    distance_matrix: np.ndarray,
    time_limit_seconds: int = 30,
) -> list[int]:
    """
    Solve the open Traveling Salesman Problem.

    Uses a dummy depot node (index N) with zero-cost edges to all real nodes.
    This lets OR-Tools find the optimal start and end (open path, not cycle).

    Args:
        distance_matrix: NxN matrix of distances (meters) as floats.
        time_limit_seconds: How long the solver may run.

    Returns:
        Ordered list of original node indices representing the visit order.
    """
    n = len(distance_matrix)

    # Build an (N+1) x (N+1) matrix with a dummy depot at index N.
    # The dummy depot has zero distance to/from every real node.
    scale = 1000  # convert to integer millimeters for OR-Tools (needs ints)
    big = (n + 1)
    int_matrix = np.zeros((big, big), dtype=np.int64)
    for i in range(n):
        for j in range(n):
            int_matrix[i][j] = int(distance_matrix[i][j] * scale)
    # Dummy depot row/col = 0 cost to/from all nodes
    # (already zero from np.zeros)

    depot = n  # index of the dummy depot

    manager = pywrapcp.RoutingIndexManager(big, 1, depot)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(int_matrix[from_node][to_node])

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Search parameters: start with cheapest arc, refine with guided local search
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.seconds = time_limit_seconds

    solution = routing.SolveWithParameters(search_params)

    if not solution:
        # Fallback: return nodes in original order
        return list(range(n))

    # Extract the route, skipping the dummy depot
    route = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node != depot:
            route.append(node)
        index = solution.Value(routing.NextVar(index))

    return route
