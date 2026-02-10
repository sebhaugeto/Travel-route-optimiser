"""Open/closed TSP solver using Google OR-Tools with guided local search."""

from typing import Optional

import numpy as np
from ortools.constraint_solver import routing_enums_pb2, pywrapcp


def solve_tsp(
    distance_matrix: np.ndarray,
    time_limit_seconds: int = 30,
    revenues: Optional[list[float]] = None,
    revenue_weight: float = 0.3,
    depot_idx: Optional[int] = None,
    closed: bool = False,
) -> list[int]:
    """
    Solve the Traveling Salesman Problem with configurable start/end behaviour.

    Modes (controlled by depot_idx and closed):
      - depot_idx=None, closed=False  ("continue"):
            Open TSP, algorithm picks best start and end.
      - depot_idx=int, closed=False   ("same_start"):
            Open TSP starting from the depot. Ends at whichever node is last.
      - depot_idx=int, closed=True    ("round_trip"):
            Closed TSP: route starts and ends at the depot.

    When `revenues` is provided and `revenue_weight > 0`, the cost function is
    modified to bias toward visiting high-revenue stores earlier in the route.

    Args:
        distance_matrix: NxN matrix of distances (meters) as floats.
        time_limit_seconds: How long the solver may run.
        revenues: Optional list of revenue values per node.
        revenue_weight: Blending factor 0..1.
        depot_idx: Index of the fixed start node (None = auto-pick).
        closed: If True and depot_idx is set, route returns to depot.

    Returns:
        Ordered list of node indices representing the visit order.
        If depot_idx is set, it will be the first element.
        If closed=True, the depot is NOT repeated at the end.
    """
    n = len(distance_matrix)

    # --- Build a cost matrix with optional revenue bias ---
    cost_matrix = distance_matrix.copy().astype(np.float64)

    if revenues is not None and revenue_weight > 0 and len(revenues) == n:
        rev = np.array(revenues, dtype=np.float64)
        max_rev = rev.max()
        if max_rev > 0:
            norm_rev = rev / max_rev
            max_dist = distance_matrix.max()
            for j in range(n):
                penalty = revenue_weight * max_dist * (1.0 - norm_rev[j])
                cost_matrix[:, j] += penalty

    scale = 1000  # to integer millimetres for OR-Tools

    if depot_idx is not None and closed:
        # --- CLOSED TSP from fixed depot ---
        int_matrix = np.zeros((n, n), dtype=np.int64)
        for i in range(n):
            for j in range(n):
                int_matrix[i][j] = int(cost_matrix[i][j] * scale)

        manager = pywrapcp.RoutingIndexManager(n, 1, depot_idx)
        routing = pywrapcp.RoutingModel(manager)

        def dist_cb_closed(from_index, to_index):
            return int(int_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)])

        cb_idx = routing.RegisterTransitCallback(dist_cb_closed)
        routing.SetArcCostEvaluatorOfAllVehicles(cb_idx)

        route = _solve_and_extract(routing, manager, n, time_limit_seconds, skip_nodes=set())
        return route

    elif depot_idx is not None and not closed:
        # --- OPEN TSP from fixed depot ---
        # Add a dummy END node (index N) with zero-cost incoming edges.
        # Route: depot -> stores -> dummy_end. Strip dummy_end from output.
        big = n + 1
        dummy_end = n
        int_matrix = np.zeros((big, big), dtype=np.int64)
        for i in range(n):
            for j in range(n):
                int_matrix[i][j] = int(cost_matrix[i][j] * scale)
        # Dummy end: zero cost FROM any node TO dummy_end (already zero)
        # Dummy end -> any node: high cost to prevent traversal
        for j in range(n):
            int_matrix[dummy_end][j] = 999_999_999

        manager = pywrapcp.RoutingIndexManager(big, 1, [depot_idx], [dummy_end])
        routing = pywrapcp.RoutingModel(manager)

        def dist_cb_open_depot(from_index, to_index):
            return int(int_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)])

        cb_idx = routing.RegisterTransitCallback(dist_cb_open_depot)
        routing.SetArcCostEvaluatorOfAllVehicles(cb_idx)

        route = _solve_and_extract(routing, manager, big, time_limit_seconds, skip_nodes={dummy_end})
        return route

    else:
        # --- OPEN TSP, no fixed start (current default) ---
        # Dummy depot at index N with zero-cost edges
        big = n + 1
        dummy_depot = n
        int_matrix = np.zeros((big, big), dtype=np.int64)
        for i in range(n):
            for j in range(n):
                int_matrix[i][j] = int(cost_matrix[i][j] * scale)

        manager = pywrapcp.RoutingIndexManager(big, 1, dummy_depot)
        routing = pywrapcp.RoutingModel(manager)

        def dist_cb_open(from_index, to_index):
            return int(int_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)])

        cb_idx = routing.RegisterTransitCallback(dist_cb_open)
        routing.SetArcCostEvaluatorOfAllVehicles(cb_idx)

        route = _solve_and_extract(routing, manager, big, time_limit_seconds, skip_nodes={dummy_depot})
        return route


def _solve_and_extract(
    routing: pywrapcp.RoutingModel,
    manager: pywrapcp.RoutingIndexManager,
    num_nodes: int,
    time_limit_seconds: int,
    skip_nodes: set[int],
) -> list[int]:
    """Run the solver and extract the route, skipping dummy nodes."""
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
        # Fallback: return real nodes in original order
        return [i for i in range(num_nodes) if i not in skip_nodes]

    route = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node not in skip_nodes:
            route.append(node)
        index = solution.Value(routing.NextVar(index))

    return route
