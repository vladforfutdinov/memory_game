'use strict';

var memGame = angular.module('myApp', ['ngRoute']);

memGame.config(function ($routeProvider) {
    $routeProvider.when('/splash', {
        templateUrl: 'partial/splash.html',
        controller:  'Splash'
    }).when('/game', {
        templateUrl: 'partial/game.html',
        controller:  'Game'
    }).otherwise({redirectTo: '/splash'});
});

memGame.controller('Splash', function ($scope, $rootScope) {
    $rootScope.grid = 4;
    $scope.root = $rootScope;
});

memGame.controller('Game', function ($scope, $rootScope, $location, $timeout, utils) {
    var REVEAL  = 700,      // how long a matched pair stays face-up before it leaves
        LEAVE   = 400,      // must outlast the .leaving animation in app.css
        PENALTY = 1000,     // how long a mismatched pair stays face-up
        MOVE    = 450,      // must match --move-duration in app.css
        STAGGER = 160,      // gap between one relocating card and the next
        RUN     = 700;      // ceiling on the whole staggered run, however many cards move

    $scope.cards = [];
    $scope.grid = 0;
    $scope.current = null;
    $scope.second = null;
    $scope.steps = 0;
    $scope.isTimeout = false;

    var unlock = function () {
        $scope.isTimeout = false;
    };

    // A card owns its position rather than living in a cell: `row`/`col` are data, and the view
    // renders them as a transform. Moving a card is then an assignment, and the element the card
    // is bound to never has to be rebuilt.
    $scope.createGrid = function (number) {
        var values = [], spots = [], r, c, i;

        for (i = 1; i <= number * number / 2; i++) values.push(i, i);
        for (r = 0; r < number; r++) {
            for (c = 0; c < number; c++) spots.push([r, c]);
        }

        spots = utils.mixRow(spots);
        $scope.cards = [];
        angular.forEach(utils.mixRow(values), function (v, n) {
            $scope.cards.push({
                id: n,
                v: v,
                row: spots[n][0],
                col: spots[n][1],
                seen: false,
                spin: 0,
                delay: 0,
                leaving: false
            });
        });

        $scope.grid = number;
    };

    $scope.resetOpen = function () {
        $scope.current = null;
        $scope.second = null;
    };

    $scope.isOpen = function (card) {
        return card === $scope.current || card === $scope.second;
    };

    var remove = function (card) {
        var at = $scope.cards.indexOf(card);
        if (at !== -1) $scope.cards.splice(at, 1);
    };

    // Every card the player has already turned over moves, one after another. Moving them in
    // sequence is what makes a crowded board work: a card that leaves frees its own square for
    // whoever comes next, so a single gap is enough to walk the whole set along. The staggered
    // delays are therefore load-bearing, not decoration — they keep the vacancy ahead of the
    // card taking it.
    $scope.shuffleSeen = function (done) {
        var taken = {}, movers = [], free = [], r, c, n;

        angular.forEach($scope.cards, function (card) {
            taken[card.row + ':' + card.col] = true;
            if (card.seen && !card.leaving && !$scope.isOpen(card)) movers.push(card);
        });

        for (r = 0; r < $scope.grid; r++) {
            for (c = 0; c < $scope.grid; c++) {
                if (!taken[r + ':' + c]) free.push([r, c]);
            }
        }

        if (!movers.length || !free.length) {
            if (done) done();
            return;
        }

        movers = utils.mixRow(movers);

        // The run keeps its one-after-another reading but never drags on: with many cards the
        // stagger shrinks so the whole reshuffle still fits inside RUN.
        var step = Math.min(STAGGER, movers.length > 1 ? RUN / (movers.length - 1) : STAGGER);

        for (n = 0; n < movers.length; n++) {
            var card = movers[n],
                pick = Math.floor(Math.random() * free.length),
                spot = free[pick];

            free[pick] = [card.row, card.col];      // the square it leaves is free for the next card
            card.row = spot[0];
            card.col = spot[1];
            card.spin += n % 2 ? -360 : 360;        // a whole turn, so the resting angle is unchanged
            card.delay = Math.round(n * step);
        }

        // The board stays locked until the last card has landed, so a click cannot catch one
        // mid-flight.
        $timeout(function () {
            if (done) done();
        }, MOVE + Math.round((movers.length - 1) * step));
    };

    $scope.rotate = function (card) {
        if ($scope.isTimeout || card.leaving || card === $scope.current) return;

        card.seen = true;
        $scope.steps++;

        if (!$scope.current) {
            $scope.current = card;
            return;
        }

        $scope.second = card;

        if ($scope.current.v === card.v) {
            var pair = [$scope.current, card];
            $scope.isTimeout = true;

            $timeout(function () {
                angular.forEach(pair, function (c) { c.leaving = true; });

                $timeout(function () {
                    angular.forEach(pair, remove);
                    $scope.resetOpen();
                    $scope.shuffleSeen(unlock);
                }, LEAVE);
            }, REVEAL);
            return;
        }

        $scope.isTimeout = true;
        $timeout(function () {
            $scope.shuffleSeen(unlock);
            $scope.resetOpen();
        }, PENALTY);
    };

    $scope.checkWin = function () {
        return $scope.grid > 0 && !$scope.cards.length;
    };

    $scope.init = function () {
        if (!$rootScope.grid) $location.path('/');
        else $scope.createGrid($rootScope.grid);
    };
    $scope.init();
});

memGame.controller('Control', function ($scope, $location) {
    $scope.stateIs = function (str) {
        return $location.$$path == '/' + str;
    };

    $scope.go = function (path) {
        $location.path(path);
    };
});
